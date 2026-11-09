#!/usr/bin/env python3
"""RLS tests against local Postgres (run setup.sql first)."""
import subprocess, sys
U = {"super": "00000000-0000-0000-0000-000000000001", "pres1": "00000000-0000-0000-0000-000000000002",
     "tres1": "00000000-0000-0000-0000-000000000003", "mem1": "00000000-0000-0000-0000-000000000004",
     "tres2": "00000000-0000-0000-0000-000000000005", "out": "00000000-0000-0000-0000-000000000006"}
EM = {k: f"{k}@uniten.edu.my" for k in U}
fails = 0

def q(sql, who=None):
    pre = "" if who is None else f"set role authenticated; set test.uid = '{U[who]}';"
    r = subprocess.run(["sudo", "-u", "postgres", "psql", "-d", "kas_test", "-qtAX", "-v", "ON_ERROR_STOP=1", "-c", pre + sql], capture_output=True, text=True)
    return r.returncode == 0, (r.stdout.strip() or r.stderr.strip().splitlines()[-1] if (r.stdout.strip() or r.stderr.strip()) else "")

def ok(name, sql, who=None, expect=None):
    global fails
    good, out = q(sql, who)
    passed = good and (expect is None or out.splitlines()[-1:] == [str(expect)])
    print(("PASS " if passed else "FAIL ") + name + ("" if passed else f"  -> {out}")); fails += not passed
    return out

def deny(name, sql, who=None):
    global fails
    good, out = q(sql, who)
    print(("PASS " if not good else "FAIL ") + name + ("" if not good else f"  -> unexpectedly allowed: {out}")); fails += good

# users sign in (auth trigger creates profiles)
for k in U: ok(f"signup {k}", f"insert into auth.users(id,email,raw_user_meta_data) values ('{U[k]}','{EM[k].upper()}','{{\"full_name\":\"{k}\"}}')")
ok("profile email lowercased", f"select email from profiles where id='{U['pres1']}'", expect=EM["pres1"])
ok("make super admin", f"update profiles set is_super_admin=true where id='{U['super']}'")

# clubs
deny("non-super cannot create club", "select create_club('Hack Club',0,'x@y.com')", "out")
c1 = ok("super creates club 1", f"select create_club('3ESC',100000,'{EM['pres1']}')", "super").splitlines()[-1]
c2 = ok("super creates club 2", f"select create_club('Rakan Muda',50000,'')", "super").splitlines()[-1]
ok("super invites tres2 to club2", f"insert into invites(club_id,email,role,invited_by) values ('{c2}','{EM['tres2']}','treasurer','{U['super']}')", "super")

# invites -> memberships
ok("pres1 accepts invite", "select accept_invites()", "pres1", expect=1)
ok("tres2 accepts invite", "select accept_invites()", "tres2", expect=1)
ok("pres1 invites tres1", f"insert into invites(club_id,email,role,invited_by) values ('{c1}','{EM['tres1']}','treasurer','{U['pres1']}')", "pres1")
ok("pres1 invites mem1", f"insert into invites(club_id,email,role,invited_by) values ('{c1}','{EM['mem1']}','member','{U['pres1']}')", "pres1")
deny("pres1 cannot invite into club2", f"insert into invites(club_id,email,role,invited_by) values ('{c2}','a@b.com','president','{U['pres1']}')", "pres1")
deny("treasurer cannot invite", f"insert into invites(club_id,email,role,invited_by) values ('{c2}','a@b.com','member','{U['tres2']}')", "tres2")
ok("tres1 accepts", "select accept_invites()", "tres1", expect=1)
ok("mem1 accepts", "select accept_invites()", "mem1", expect=1)
ok("outsider has nothing to accept", "select accept_invites()", "out", expect=0)
ok("impostor signs up with unverified email", "insert into auth.users(id,email,email_confirmed_at) values ('00000000-0000-0000-0000-000000000009','victim@uniten.edu.my',null)")
ok("invite victim email", f"insert into invites(club_id,email,role,invited_by) values ('{c1}','victim@uniten.edu.my','treasurer','{U['pres1']}')", "pres1")
U["imp"]="00000000-0000-0000-0000-000000000009"
ok("unverified impostor cannot claim invite", "select accept_invites()", "imp", expect=0)
ok("impostor sees no clubs", "select count(*) from clubs", "imp", expect=0)

# visibility
ok("pres1 sees only club1", "select count(*) from clubs", "pres1", expect=1)
ok("tres2 sees only club2", "select string_agg(name,',') from clubs", "tres2", expect="Rakan Muda")
ok("outsider sees no clubs", "select count(*) from clubs", "out", expect=0)
ok("super sees all clubs", "select count(*) from clubs", "super", expect=2)
ok("pres1 sees club1 members only", "select count(*) from memberships", "pres1", expect=3)
ok("outsider sees only own profile", "select count(*) from profiles", "out", expect=1)
deny("user cannot make self super", f"update profiles set is_super_admin=true where id='{U['out']}'", "out")
ok("still not super", f"select is_super_admin from profiles where id='{U['out']}'", expect="f")
deny("anon cannot read", "set role anon; select * from clubs")

# calendar events
ev = ok("pres1 creates event", f"insert into events(club_id,title,location,starts_at,ends_at,budget_cents,created_by) values ('{c1}','Green Week','DSS','2026-12-01 09:00+08','2026-12-02 17:00+08',300000,'{U['pres1']}') returning id", "pres1").splitlines()[-1]
deny("member cannot create event", f"insert into events(club_id,title,starts_at,created_by) values ('{c1}','X',now(),'{U['mem1']}')", "mem1")
deny("pres1 cannot create event in club2", f"insert into events(club_id,title,starts_at,created_by) values ('{c2}','X',now(),'{U['pres1']}')", "pres1")
ok("member sees club1 calendar", "select count(*) from events", "mem1", expect=1)
ok("tres2 cannot see club1 calendar", "select count(*) from events", "tres2", expect=0)

# transactions
ins = lambda club, who, extra="": f"insert into transactions(club_id,type,amount_cents,category,description,receipt_path,created_by{',' + extra.split('=')[0] if extra else ''}) values ('{club}','expense',45000,'F&B','Katering','{club}/r.jpg','{U[who]}'{',' + extra.split('=')[1] if extra else ''}) returning id"
t1 = ok("treasurer records tx", ins(c1, "tres1"), "tres1").splitlines()[-1]
deny("member cannot record tx", ins(c1, "mem1"), "mem1")
deny("treasurer cannot record into other club", ins(c2, "tres1"), "tres1")
deny("cannot insert pre-approved tx", ins(c1, "tres1", "status='approved'"), "tres1")
deny("cannot impersonate creator", f"insert into transactions(club_id,type,amount_cents,category,description,receipt_path,created_by) values ('{c1}','expense',1,'x','x','{c1}/r.jpg','{U['pres1']}')", "tres1")
deny("receipt must be in club folder", f"insert into transactions(club_id,type,amount_cents,category,description,receipt_path,created_by) values ('{c1}','expense',1,'x','x','{c2}/r.jpg','{U['tres1']}')", "tres1")
deny("negative amount rejected", f"insert into transactions(club_id,type,amount_cents,category,description,receipt_path,created_by) values ('{c1}','expense',-5,'x','x','{c1}/r.jpg','{U['tres1']}')", "tres1")
deny("treasurer cannot self-approve via update", f"update transactions set status='approved' where id={t1}", "tres1")
deny("treasurer cannot decide", f"select decide_transaction({t1},true)", "tres1")
deny("reject needs reason", f"select decide_transaction({t1},false,'')", "pres1")
ok("president approves", f"select decide_transaction({t1},true)", "pres1")
deny("cannot decide twice", f"select decide_transaction({t1},false,'x')", "pres1")
deny("tx cannot be deleted", f"delete from transactions where id={t1}")
ok("tres2 cannot see club1 tx", "select count(*) from transactions", "tres2", expect=0)
r = ok("treasurer reverses", f"select reverse_transaction({t1},'salah jumlah')", "tres1").splitlines()[-1]
deny("double reversal blocked", f"select reverse_transaction({t1},'again')", "tres1")
ok("approve reversal", f"select decide_transaction({r},true)", "pres1")
ok("net expense after reversal is 0", f"select sum(case when type='income' then amount_cents else -amount_cents end) from transactions where club_id='{c1}' and status='approved'", "pres1", expect=0)

# self approval when user is both treasurer & president
# audit
ok("audit has entries for club1", f"select count(*) > 5 from audit_log where club_id='{c1}'", "pres1", expect="t")
ok("member cannot read audit", "select count(*) from audit_log", "mem1", expect=0)
ok("tres2 cannot read club1 audit", f"select count(*) from audit_log where club_id='{c1}'", "tres2", expect=0)
deny("cannot write audit directly", f"insert into audit_log(club_id,action) values ('{c1}','fake')", "pres1")
deny("cannot call audit()", f"select audit('{c1}','fake','{{}}')", "pres1")

# membership mgmt
ok("president cannot remove self (0 rows)", f"with d as (delete from memberships where user_id='{U['pres1']}' returning 1) select count(*) from d", "pres1", expect=0)
ok("tres2 cannot delete club1 members (0 rows)", f"with d as (delete from memberships where club_id='{c1}' returning 1) select count(*) from d", "tres2", expect=0)
ok("president can remove a member", f"with d as (delete from memberships where user_id='{U['tres1']}' returning 1) select count(*) from d", "pres1", expect=1)
ok("removed treasurer loses access", "select count(*) from transactions", "tres1", expect=0)
ok("president promotes member to secretary", f"update memberships set role='secretary' where user_id='{U['mem1']}' and club_id='{c1}'", "pres1")
ok("role updated", f"select role from memberships where user_id='{U['mem1']}'", expect="secretary")
deny("president cannot move member to other club", f"update memberships set club_id='{c2}' where user_id='{U['mem1']}'", "pres1")

print(f"\n{'ALL PASSED' if not fails else str(fails) + ' FAILED'}"); sys.exit(1 if fails else 0)
