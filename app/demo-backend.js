// Demo backend: an in-browser fake of supabase-js for Kas, so the multi-club app can be explored without login.
// Data lives in localStorage. Visibility rules mirror the real RLS (members see only their clubs, SRC admin sees all).
(function () {
  const KEY = "kas-demo-v2", UKEY = "kas-demo-user";
  const d = (n, h = 9) => { const x = new Date(); x.setDate(x.getDate() + n); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  const day = n => d(n).slice(0, 10);
  const svg = (t, amt) => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='360' height='480'><rect width='360' height='480' fill='#fff'/><rect x='12' y='12' width='336' height='456' fill='none' stroke='#ddd'/><text x='180' y='70' font-family='monospace' font-size='20' text-anchor='middle'>RESIT</text><text x='180' y='130' font-family='monospace' font-size='14' text-anchor='middle'>${t}</text><text x='180' y='400' font-family='monospace' font-size='26' font-weight='bold' text-anchor='middle'>${amt}</text></svg>`);

  function seed() {
    const P = [
      ["u-src", "Nurul (Admin SRC)", "src@uniten.demo", true],
      ["u-haziq", "Haziq", "haziq@uniten.demo"], ["u-aina", "Aina", "aina@uniten.demo"], ["u-syafiq", "Syafiq", "syafiq@uniten.demo"], ["u-mira", "Mira", "mira@uniten.demo"],
      ["u-danial", "Danial", "danial@uniten.demo"], ["u-farah", "Farah", "farah@uniten.demo"],
      ["u-izzat", "Izzat", "izzat@uniten.demo"], ["u-sofea", "Sofea", "sofea@uniten.demo"],
    ].map(([id, full_name, email, s]) => ({id, full_name, email, is_super_admin: !!s, avatar_url: null}));
    const clubs = [{id: "c-3esc", name: "3ESC Energy, Economics & Env", opening_cents: 120000}, {id: "c-rm", name: "Sekretariat Rakan Muda", opening_cents: 80000}, {id: "c-robo", name: "Robotics Club", opening_cents: 50000}];
    const M = [["c-3esc", "u-haziq", "president"], ["c-3esc", "u-aina", "treasurer"], ["c-3esc", "u-syafiq", "secretary"], ["c-3esc", "u-mira", "member"],
      ["c-rm", "u-danial", "president"], ["c-rm", "u-farah", "treasurer"], ["c-rm", "u-mira", "member"],
      ["c-robo", "u-izzat", "president"], ["c-robo", "u-sofea", "treasurer"]].map(([club_id, user_id, role]) => ({club_id, user_id, role}));
    const events = [
      {id: "e1", club_id: "c-3esc", title: "Green Energy Week", location: "Dewan Seri Sarjana", starts_at: d(4), ends_at: d(6, 17), budget_cents: 350000, description: "Pameran dan forum tenaga boleh baharu."},
      {id: "e2", club_id: "c-3esc", title: "AGM 2026", location: "Bilik Seminar BW", starts_at: d(-12, 20), ends_at: d(-12, 23), budget_cents: 80000},
      {id: "e3", club_id: "c-3esc", title: "Lawatan TNB Research", location: "Kajang", starts_at: d(15, 8), ends_at: d(15, 16), budget_cents: 120000},
      {id: "e4", club_id: "c-rm", title: "Program Khidmat Komuniti", location: "Hulu Langat", starts_at: d(9, 7), ends_at: d(10, 18), budget_cents: 150000},
      {id: "e5", club_id: "c-rm", title: "Gotong-royong Kolej", location: "Kolej Kediaman", starts_at: d(2, 8), ends_at: d(2, 12), budget_cents: 20000},
      {id: "e6", club_id: "c-robo", title: "Robo Sumo Competition", location: "Dewan Kuliah 3", starts_at: d(20, 9), ends_at: d(20, 18), budget_cents: 250000},
    ];
    let n = 0; const tx = [];
    const t = (club_id, event_id, type, amt, category, description, by, status, days, decided_by, note) => {
      n++; tx.push({id: n, club_id, event_id, type, amount_cents: amt, category, description, txn_date: day(days), receipt_path: `${club_id}/r${n}.svg`,
        status, created_by: by, created_at: d(days), decided_by: status === "submitted" ? null : decided_by, decided_at: status === "submitted" ? null : d(days + 1), decision_note: note || null, reverses_id: null});
    };
    t("c-3esc", "e1", "income", 200000, "Sponsorship", "Tajaan TNB Green Energy Week", "u-aina", "approved", -40, "u-haziq");
    t("c-3esc", "e2", "income", 30000, "Membership fee", "Yuran ahli 60 orang", "u-aina", "approved", -35, "u-haziq");
    t("c-3esc", "e1", "expense", 85000, "Venue", "Sewa dewan 2 hari", "u-aina", "approved", -30, "u-haziq");
    t("c-3esc", "e2", "expense", 45000, "F&B", "Katering AGM 60 pax", "u-aina", "approved", -12, "u-haziq");
    t("c-3esc", "e1", "expense", 120000, "Merchandise", "T-shirt event 100 helai", "u-aina", "rejected", -8, "u-haziq", "Perlu 3 sebut harga");
    t("c-3esc", "e1", "expense", 98000, "Merchandise", "T-shirt event (3 sebut harga)", "u-aina", "submitted", -2);
    t("c-3esc", "e1", "expense", 26000, "Printing", "Banner dan bunting", "u-aina", "submitted", -1);
    t("c-rm", "e4", "income", 150000, "Grant", "Geran HEP program komuniti", "u-farah", "approved", -20, "u-danial");
    t("c-rm", "e4", "expense", 70000, "Transport", "Sewa bas ke Hulu Langat", "u-farah", "approved", -15, "u-danial");
    t("c-rm", "e4", "expense", 54000, "Supplies", "Barang sumbangan 30 keluarga", "u-farah", "submitted", -3);
    t("c-robo", "e6", "income", 100000, "Sponsorship", "Tajaan syarikat automasi", "u-sofea", "approved", -18, "u-izzat");
    t("c-robo", "e6", "expense", 64000, "Supplies", "Komponen motor dan sensor", "u-sofea", "approved", -10, "u-izzat");
    const receipts = {}; tx.forEach(x => receipts[x.receipt_path] = svg(x.description.slice(0, 30), "RM " + (x.amount_cents / 100).toFixed(2)));
    const invites = [{id: "i1", club_id: "c-3esc", email: "baru@uniten.demo", role: "member", invited_by: "u-haziq", accepted_at: null}];
    const audit_log = tx.map((x, i) => ({id: i + 1, club_id: x.club_id, user_id: x.created_by, action: "transaction.create", detail: {id: x.id, amount_cents: x.amount_cents}, at: x.created_at}));
    return {profiles: P, clubs, memberships: M, events, transactions: tx, invites, audit_log, receipts, seq: {tx: n, audit: audit_log.length}};
  }
  let DB = JSON.parse(localStorage.getItem(KEY) || "null") || seed();
  const save = () => localStorage.setItem(KEY, JSON.stringify(DB));
  let UID = localStorage.getItem(UKEY) || "u-aina";
  const me = () => DB.profiles.find(p => p.id === UID);
  const roleIn = c => (DB.memberships.find(m => m.club_id === c && m.user_id === UID) || {}).role;
  const canView = c => me().is_super_admin || !!roleIn(c);
  const audit = (club_id, action, detail) => DB.audit_log.push({id: ++DB.seq.audit, club_id, user_id: UID, action, detail, at: new Date().toISOString()});
  const err = message => ({data: null, error: {message}});

  const VIS = {
    profiles: r => r.id === UID || me().is_super_admin || DB.memberships.some(a => a.user_id === UID && DB.memberships.some(b => b.club_id === a.club_id && b.user_id === r.id)),
    clubs: r => canView(r.id), memberships: r => canView(r.club_id), events: r => canView(r.club_id), transactions: r => canView(r.club_id),
    invites: r => me().is_super_admin || roleIn(r.club_id) === "president",
    audit_log: r => me().is_super_admin || ["president", "treasurer", "secretary"].includes(roleIn(r.club_id)),
  };

  function from(table) {
    let filters = [], op = "select", payload = null, single = false, order = null, wantSelect = false, joinProfiles = false;
    const api = {
      select(cols) { if (op === "select") joinProfiles = /profiles\(/.test(cols || ""); else wantSelect = true; return api; },
      eq(k, v) { filters.push(r => r[k] === v); return api; },
      is(k, v) { filters.push(r => (r[k] ?? null) === v); return api; },
      order(k, o = {}) { order = [k, o.ascending !== false]; return api; }, limit() { return api; },
      single() { single = true; return api; },
      insert(r) { op = "insert"; payload = r; return api; }, update(r) { op = "update"; payload = r; return api; }, delete() { op = "delete"; return api; },
      then(res, rej) { try { res(run()); } catch (e) { res(err(e.message)); } },
    };
    function rows() { return DB[table].filter(VIS[table]).filter(r => filters.every(f => f(r))); }
    function run() {
      if (op === "select") {
        let out = rows().map(r => joinProfiles ? {...r, profiles: DB.profiles.find(p => p.id === r.user_id)} : {...r});
        if (order) out.sort((a, b) => (a[order[0]] > b[order[0]] ? 1 : -1) * (order[1] ? 1 : -1));
        return {data: single ? out[0] || null : out, error: null};
      }
      if (op === "insert") {
        const r = {...payload};
        if (table === "transactions") {
          if (roleIn(r.club_id) !== "treasurer") return err("Bendahari sahaja boleh rekod transaksi");
          Object.assign(r, {id: ++DB.seq.tx, status: "submitted", created_at: new Date().toISOString(), decided_by: null, decided_at: null, decision_note: null, reverses_id: null});
          audit(r.club_id, "transaction.create", {id: r.id, amount_cents: r.amount_cents});
        } else if (table === "events") {
          if (!["president", "secretary", "treasurer"].includes(roleIn(r.club_id))) return err("Tiada kebenaran tambah program");
          r.id = "e" + Date.now(); audit(r.club_id, "events.insert", {title: r.title});
        } else if (table === "invites") {
          if (roleIn(r.club_id) !== "president" && !me().is_super_admin) return err("Presiden sahaja boleh jemput");
          if (DB.invites.some(i => i.club_id === r.club_id && i.email === r.email)) return {data: null, error: {message: "dup", code: "23505"}};
          r.id = "i" + Date.now(); r.accepted_at = null;
          const u = DB.profiles.find(p => p.email === r.email);   // demo: existing users join instantly
          if (u) { DB.memberships = DB.memberships.filter(m => !(m.club_id === r.club_id && m.user_id === u.id)); DB.memberships.push({club_id: r.club_id, user_id: u.id, role: r.role}); r.accepted_at = new Date().toISOString(); }
          audit(r.club_id, "invites.insert", {email: r.email, role: r.role});
        }
        DB[table].push(r); save();
        return {data: single ? r : [r], error: null};
      }
      const target = rows();
      if (op === "update") {
        for (const r of target) {
          if (table === "memberships" && roleIn(r.club_id) !== "president") return err("Presiden sahaja");
          if (table === "events" && !["president", "secretary", "treasurer"].includes(roleIn(r.club_id))) return err("Tiada kebenaran");
          Object.assign(r, payload); audit(r.club_id, table + ".update", payload);
        }
        save(); return {data: target, error: null};
      }
      if (op === "delete") {
        if (table === "transactions") return err("Transaksi tak boleh dipadam");
        for (const r of target) {
          if (table === "memberships" && (roleIn(r.club_id) !== "president" || r.user_id === UID)) return err("Tiada kebenaran");
          if (table === "events" && !["president", "secretary"].includes(roleIn(r.club_id))) return err("Tiada kebenaran");
          audit(r.club_id, table + ".delete", {});
        }
        DB[table] = DB[table].filter(r => !target.includes(r)); save(); return {data: null, error: null};
      }
    }
    return api;
  }

  async function rpc(fn, a) {
    if (fn === "accept_invites") return {data: 0, error: null};
    if (fn === "create_club") {
      if (!me().is_super_admin) return err("Admin SRC sahaja");
      if (DB.clubs.some(c => c.name.toLowerCase() === a.p_name.trim().toLowerCase())) return err("Nama club dah wujud");
      const id = "c-" + Date.now(); DB.clubs.push({id, name: a.p_name.trim(), opening_cents: a.p_opening_cents || 0});
      if (a.p_president_email) { const em = a.p_president_email.trim().toLowerCase(), u = DB.profiles.find(p => p.email === em);
        if (u) DB.memberships.push({club_id: id, user_id: u.id, role: "president"}); else DB.invites.push({id: "i" + Date.now(), club_id: id, email: em, role: "president", invited_by: UID, accepted_at: null}); }
      audit(id, "club.create", {name: a.p_name}); save(); return {data: id, error: null};
    }
    if (fn === "decide_transaction") {
      const t = DB.transactions.find(x => x.id === a.p_id);
      if (!t) return err("Tak jumpa");
      if (roleIn(t.club_id) !== "president") return err("Presiden club ni sahaja boleh lulus");
      if (t.created_by === UID) return err("Tak boleh lulus transaksi sendiri");
      if (t.status !== "submitted") return err("Dah " + t.status);
      if (!a.p_approve && !(a.p_note || "").trim()) return err("Sebab wajib");
      Object.assign(t, {status: a.p_approve ? "approved" : "rejected", decided_by: UID, decided_at: new Date().toISOString(), decision_note: a.p_note || null});
      audit(t.club_id, "transaction." + t.status, {id: t.id, note: a.p_note}); save(); return {data: null, error: null};
    }
    if (fn === "reverse_transaction") {
      const t = DB.transactions.find(x => x.id === a.p_id);
      if (!t || t.status !== "approved" || t.reverses_id) return err("Tak boleh dibetulkan");
      if (roleIn(t.club_id) !== "treasurer") return err("Bendahari sahaja");
      if (DB.transactions.some(x => x.reverses_id === t.id && x.status !== "rejected")) return err("Pembetulan dah wujud");
      const r = {...t, id: ++DB.seq.tx, type: t.type === "income" ? "expense" : "income", category: "Reversal", description: `Reverses #${t.id}: ${a.p_reason}`.slice(0, 200),
        txn_date: new Date().toISOString().slice(0, 10), status: "submitted", created_by: UID, created_at: new Date().toISOString(), decided_by: null, decided_at: null, decision_note: null, reverses_id: t.id};
      DB.transactions.push(r); audit(t.club_id, "transaction.create", {id: r.id, reverses: t.id}); save(); return {data: r.id, error: null};
    }
    return err("Unknown rpc " + fn);
  }

  const storage = {from: () => ({
    upload: async (path, file) => new Promise(res => { const rd = new FileReader(); rd.onload = () => { DB.receipts[path] = rd.result; save(); res({data: {path}, error: null}); }; rd.readAsDataURL(file); }),
    createSignedUrl: async path => DB.receipts[path] ? {data: {signedUrl: DB.receipts[path]}, error: null} : err("Resit tak jumpa"),
  })};

  window.supabase = {createClient: () => ({
    auth: {getSession: async () => ({data: {session: {user: {id: UID, email: me().email}}}}), onAuthStateChange: () => {}, signOut: async () => {},
      signInWithPassword: async () => ({error: null}), signUp: async () => ({data: {}, error: null}), resetPasswordForEmail: async () => ({error: null})},
    from, rpc, storage,
  })};
  window.KAS_CONFIG = {SUPABASE_URL: "demo", SUPABASE_ANON_KEY: "demo", ALLOWED_DOMAINS: [], APP_NAME: "Kas · DEMO"};

  // persona switcher bar
  window.addEventListener("DOMContentLoaded", () => {
    const roleOf = p => p.is_super_admin ? "Admin SRC · semua club" : DB.memberships.filter(m => m.user_id === p.id).map(m => `${({president: "Presiden", treasurer: "Bendahari", secretary: "Setiausaha", member: "Ahli"})[m.role]} ${DB.clubs.find(c => c.id === m.club_id)?.name.split(" ")[0]}`).join(", ") || "tiada club";
    const bar = document.createElement("div");
    bar.className = "demobar noprint";
    bar.innerHTML = `<b>MOD DEMO</b><span class="hide-m">Tukar watak untuk tengok apa setiap orang nampak:</span><select id="demoUser">${DB.profiles.map(p => `<option value="${p.id}" ${p.id === UID ? "selected" : ""}>${p.full_name} (${roleOf(p)})</option>`).join("")}</select><button id="demoReset">Reset data</button>`;
    document.body.prepend(bar);
    bar.querySelector("#demoUser").onchange = e => { localStorage.setItem(UKEY, e.target.value); location.hash = "dashboard"; location.reload(); };
    bar.querySelector("#demoReset").onclick = () => { if (confirm("Reset semua data demo?")) { localStorage.removeItem(KEY); location.reload(); } };
    window.signOut = () => alert("Mod demo: tukar watak guna dropdown kat atas.");
  });
})();
