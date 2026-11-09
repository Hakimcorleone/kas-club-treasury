/* Kas · Club Treasury · Supabase edition */
const CFG = window.KAS_CONFIG || {};
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[m]));
const MYR = c => (c < 0 ? "-" : "") + "RM " + (Math.abs(c) / 100).toLocaleString("en-MY", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const toCents = v => { const n = Math.round(parseFloat(String(v).replace(/[^0-9.]/g, "")) * 100); return n > 0 ? n : null; };
const ymd = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
const today = () => ymd(new Date());
const fmtDT = d => new Date(d).toLocaleString("ms-MY", {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"});
const ROLE_LABEL = {president: "Presiden", treasurer: "Bendahari", secretary: "Setiausaha", member: "Ahli", super: "Admin SRC"};

let sb, ME = null, CLUBS = [], CLUB = null, ROLE = null, D = {members: [], events: [], tx: [], invites: []};

function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 2600); }
function modal(h) { $("modalBody").innerHTML = h; $("modal").classList.add("on"); }
function closeModal() { $("modal").classList.remove("on"); }
function show(id) { ["login", "noaccess", "app"].forEach(x => $(x).classList.toggle("hidden", x !== id)); }
const fail = (error, msg) => { if (error) { console.error(error); toast(msg || error.message); return true; } return false; };

/* ---------- auth ---------- */
async function signIn() {
  const {error} = await sb.auth.signInWithOAuth({provider: "google", options: {redirectTo: location.origin + location.pathname, queryParams: {prompt: "select_account"}}});
  fail(error);
}
async function signOut() { await sb.auth.signOut(); location.hash = ""; location.reload(); }

async function boot() {
  $("appName").textContent = $("appName2").textContent = CFG.APP_NAME || "Club Treasury";
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) { show("login"); $("loginMsg").textContent = "Belum dikonfigurasi: isi SUPABASE_URL dan SUPABASE_ANON_KEY dalam config.js"; return; }
  sb = sb || supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  const {data: {session}} = await sb.auth.getSession();
  if (!session) return show("login");
  const email = (session.user.email || "").toLowerCase();
  if ((CFG.ALLOWED_DOMAINS || []).length && !CFG.ALLOWED_DOMAINS.some(d => email.endsWith("@" + d))) {
    await sb.auth.signOut(); show("login"); $("loginMsg").textContent = `Email ${email} tak dibenarkan. Guna email ${CFG.ALLOWED_DOMAINS.join(" / ")}.`; return;
  }
  await sb.rpc("accept_invites");
  const {data: prof} = await sb.from("profiles").select("*").eq("id", session.user.id).single();
  ME = prof || {id: session.user.id, email, full_name: email};
  const {data: mem} = await sb.from("memberships").select("role, club_id").eq("user_id", ME.id);
  const {data: clubs} = await sb.from("clubs").select("*").order("name");
  CLUBS = (clubs || []).map(c => ({...c, role: (mem || []).find(m => m.club_id === c.id)?.role || (ME.is_super_admin ? "super" : null)}));
  if (!CLUBS.length && !ME.is_super_admin) { $("naEmail").textContent = email; return show("noaccess"); }
  show("app");
  $("meName").textContent = ME.full_name || email; $("meEmail").textContent = email;
  if (ME.avatar_url) $("avatar").src = ME.avatar_url;
  const saved = localStorage.getItem("kas-club");
  await selectClub((CLUBS.find(c => c.id === saved) || CLUBS[0] || {}).id);
}

async function selectClub(id) {
  CLUB = CLUBS.find(c => c.id === id) || null; ROLE = CLUB?.role || (ME.is_super_admin ? "super" : null);
  if (CLUB) localStorage.setItem("kas-club", CLUB.id);
  $("clubSel").innerHTML = CLUBS.map(c => `<option value="${c.id}" ${c.id === CLUB?.id ? "selected" : ""}>${esc(c.name)}</option>`).join("") || `<option>Tiada club</option>`;
  $("myRole").textContent = ROLE ? ROLE_LABEL[ROLE] + (ME.is_super_admin && ROLE !== "super" ? " · Admin SRC" : "") : "";
  await loadClub(); route();
}

async function loadClub() {
  if (!CLUB) { D = {members: [], events: [], tx: [], invites: []}; return; }
  const c = CLUB.id;
  const [m, e, t, i] = await Promise.all([
    sb.from("memberships").select("user_id, role, profiles(full_name, email, avatar_url)").eq("club_id", c),
    sb.from("events").select("*").eq("club_id", c).order("starts_at"),
    sb.from("transactions").select("*").eq("club_id", c).order("id", {ascending: false}),
    can("president") ? sb.from("invites").select("*").eq("club_id", c).is("accepted_at", null) : Promise.resolve({data: []}),
  ]);
  [m, e, t, i].forEach(r => r.error && fail(r.error));
  D = {members: m.data || [], events: e.data || [], tx: t.data || [], invites: i.data || []};
}

const can = (...roles) => roles.includes(ROLE);
const person = id => { const m = D.members.find(x => x.user_id === id); return m ? (m.profiles?.full_name || m.profiles?.email) : (id === ME.id ? ME.full_name : "-"); };

/* ---------- stats ---------- */
function stats() {
  const ok = D.tx.filter(t => t.status === "approved");
  const inc = ok.filter(t => t.type === "income").reduce((a, t) => a + t.amount_cents, 0);
  const exp = ok.filter(t => t.type === "expense").reduce((a, t) => a + t.amount_cents, 0);
  return {ok, inc, exp, opening: CLUB.opening_cents, bal: CLUB.opening_cents + inc - exp, pend: D.tx.filter(t => t.status === "submitted")};
}
const evSpent = id => D.tx.filter(t => t.event_id === id && t.status === "approved").reduce((a, t) => a + (t.type === "expense" ? t.amount_cents : -t.amount_cents), 0);

/* ---------- nav ---------- */
const PAGES = {
  dashboard: {label: "Dashboard", icon: "◧", show: () => CLUB},
  calendar: {label: "Kalendar", icon: "▦", show: () => CLUB},
  add: {label: "Rekod transaksi", icon: "＋", show: () => can("treasurer")},
  approvals: {label: "Kelulusan", icon: "✓", show: () => can("president")},
  transactions: {label: "Transaksi", icon: "≡", show: () => CLUB},
  report: {label: "Laporan", icon: "▤", show: () => CLUB},
  members: {label: "Ahli & jemputan", icon: "☺", show: () => CLUB},
  audit: {label: "Audit log", icon: "⌁", show: () => CLUB && can("president", "treasurer", "secretary", "super")},
  admin: {label: "Admin SRC", icon: "⚙", show: () => ME?.is_super_admin},
};
function nav(cur) {
  const pend = can("president") ? D.tx.filter(t => t.status === "submitted" && t.created_by !== ME.id).length : 0;
  $("nav").innerHTML = Object.entries(PAGES).filter(([, p]) => p.show()).map(([k, p]) =>
    `<a href="#${k}" class="${k === cur ? "on" : ""}" onclick="$('side').classList.remove('open')"><span>${p.icon}</span>${p.label}${k === "approvals" && pend ? `<span class="badge">${pend}</span>` : ""}</a>`).join("");
}
const header = (title, sub, right = "") => `<div class="head"><div><button class="btn s menu noprint" onclick="$('side').classList.add('open')">☰</button><h1>${title}</h1><div class="muted">${sub}</div></div><div class="row noprint" style="flex-wrap:wrap">${right}</div></div>`;
const pill = s => `<span class="pill ${s}">${{submitted: "Pending", approved: "Approved", rejected: "Rejected"}[s]}</span>`;

/* ---------- pages ---------- */
function pDashboard() {
  const s = stats();
  const months = [...Array(6)].map((_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5 + i); return ymd(d).slice(0, 7); });
  const mv = months.map(m => { const t = s.ok.filter(x => x.txn_date.startsWith(m)); return {m, i: t.filter(x => x.type === "income").reduce((a, b) => a + b.amount_cents, 0), o: t.filter(x => x.type === "expense").reduce((a, b) => a + b.amount_cents, 0)}; });
  const mx = Math.max(1, ...mv.flatMap(x => [x.i, x.o]));
  const cats = {}; s.ok.filter(x => x.type === "expense").forEach(x => cats[x.category] = (cats[x.category] || 0) + x.amount_cents);
  const cl = Object.entries(cats).sort((a, b) => b[1] - a[1]); const ct = cl.reduce((a, b) => a + b[1], 0) || 1;
  const up = D.events.filter(e => new Date(e.ends_at || e.starts_at) >= new Date(today())).slice(0, 4);
  return header(esc(CLUB.name), "Ringkasan kewangan. Kira transaksi yang dah lulus sahaja.") + `
  ${s.pend.length ? `<div class="alert" style="margin-bottom:16px">${s.pend.length} transaksi (${MYR(s.pend.reduce((a, b) => a + b.amount_cents, 0))}) menunggu kelulusan presiden.</div>` : ""}
  <div class="grid g4">
    <div class="card kpi"><div class="l">Baki semasa</div><div class="v">${MYR(s.bal)}</div><div class="h">Baki awal ${MYR(s.opening)}</div></div>
    <div class="card kpi"><div class="l">Jumlah masuk</div><div class="v in">${MYR(s.inc)}</div></div>
    <div class="card kpi"><div class="l">Jumlah keluar</div><div class="v out">${MYR(s.exp)}</div></div>
    <div class="card kpi"><div class="l">Pending</div><div class="v" style="color:var(--warn)">${s.pend.length}</div></div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="row sp"><h2>Aliran 6 bulan</h2><span class="small muted"><b style="color:var(--in)">■</b> masuk <b style="color:var(--out)">■</b> keluar</span></div>
      <div class="chart">${mv.map(x => `<div class="c"><div><b style="height:${x.i / mx * 120}px;background:var(--in)"></b><b style="height:${x.o / mx * 120}px;background:var(--out)"></b></div><small>${new Date(x.m + "-01").toLocaleString("en", {month: "short"})}</small></div>`).join("")}</div></div>
    <div class="card"><div class="row sp"><h2>Program akan datang</h2><a class="small" href="#calendar">Kalendar →</a></div>${up.length ? up.map(e => evRow(e)).join("") : `<div class="empty">Tiada program.</div>`}</div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="row sp"><h2>Transaksi terkini</h2><a href="#transactions" class="small">Semua →</a></div>${txTable(D.tx.slice(0, 5))}</div>
    <div class="card"><h2>Belanja ikut kategori</h2>${cl.length ? cl.map(([k, v]) => `<div style="margin-bottom:10px"><div class="row sp small"><span>${esc(k)}</span><b>${MYR(v)}</b></div><div class="bar"><i style="width:${v / ct * 100}%"></i></div></div>`).join("") : `<div class="empty">Belum ada perbelanjaan.</div>`}</div>
  </div>`;
}
function evRow(e) {
  const sp = evSpent(e.id), pc = e.budget_cents ? sp / e.budget_cents * 100 : 0;
  return `<div style="padding:10px 0;border-bottom:1px solid #f1eee9;cursor:pointer" onclick="showEvent('${e.id}')"><div class="row sp"><b>${esc(e.title)}</b><span class="small muted">${fmtDT(e.starts_at)}</span></div>
    <div class="small muted">${esc(e.location || "")}${e.budget_cents ? ` · ${MYR(sp)} / ${MYR(e.budget_cents)}` : ""}</div>
    ${e.budget_cents ? `<div class="bar" style="margin-top:6px"><i class="${pc > 100 ? "x" : pc > 80 ? "w" : ""}" style="width:${Math.min(100, pc)}%"></i></div>` : ""}</div>`;
}

function txTable(rows, actions) {
  if (!rows.length) return `<div class="empty">Tiada transaksi.</div>`;
  return `<table><thead><tr><th>#</th><th>Tarikh</th><th>Butiran</th><th class="hide-m">Program</th><th>Status</th><th class="r">Jumlah</th><th class="noprint">Resit</th>${actions ? "<th></th>" : ""}</tr></thead><tbody>${rows.map(t => {
    const ev = D.events.find(e => e.id === t.event_id);
    return `<tr><td class="muted">${t.id}</td><td class="small nw">${t.txn_date}</td><td><b>${esc(t.category)}</b><div class="small muted">${esc(t.description)}</div>
      <div class="small muted">oleh ${esc(person(t.created_by))}${t.decided_by ? ` · ${t.status === "approved" ? "lulus" : "tolak"} ${esc(person(t.decided_by))}` : ""}${t.decision_note ? ` · “${esc(t.decision_note)}”` : ""}</div></td>
      <td class="small hide-m">${ev ? esc(ev.title) : "-"}</td><td>${pill(t.status)}</td><td class="r ${t.type === "income" ? "in" : "out"}">${t.type === "income" ? "+" : "−"}${MYR(t.amount_cents)}</td>
      <td class="noprint"><button class="btn s" onclick="showReceipt(${t.id})">Lihat</button></td>${actions ? `<td>${actions(t)}</td>` : ""}</tr>`;
  }).join("")}</tbody></table>`;
}
async function showReceipt(id) {
  const t = D.tx.find(x => x.id === id);
  const {data, error} = await sb.storage.from("receipts").createSignedUrl(t.receipt_path, 300);
  if (fail(error, "Tak dapat buka resit")) return;
  const pdf = t.receipt_path.endsWith(".pdf");
  modal(`<div class="row sp"><h2>Resit #${t.id}</h2><button class="btn s" onclick="closeModal()">Tutup</button></div>${pdf ? `<a class="btn p" href="${data.signedUrl}" target="_blank" rel="noopener">Buka PDF</a>` : `<img src="${data.signedUrl}" alt="resit">`}`);
}

/* calendar */
let calMonth = today().slice(0, 7);
function pCalendar() {
  const [y, m] = calMonth.split("-").map(Number), first = new Date(y, m - 1, 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const cells = [...Array(42)].map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const canAdd = can("president", "secretary", "treasurer");
  const evOn = d => D.events.filter(e => { const s = ymd(e.starts_at), en = ymd(e.ends_at || e.starts_at), k = ymd(d); return k >= s && k <= en; });
  const shift = n => { const d = new Date(y, m - 1 + n, 1); return ymd(d).slice(0, 7); };
  const label = first.toLocaleString("ms-MY", {month: "long", year: "numeric"});
  return header("Kalendar program", `${esc(CLUB.name)} · ${canAdd ? "tekan tarikh untuk tambah program" : "tarikh program club"}`,
    `<button class="btn" onclick="calMonth='${shift(-1)}';route()">‹</button><b style="min-width:140px;text-align:center">${label}</b><button class="btn" onclick="calMonth='${shift(1)}';route()">›</button><button class="btn" onclick="calMonth=today().slice(0,7);route()">Hari ini</button>${canAdd ? `<button class="btn p" onclick="eventForm()">+ Program</button>` : ""}`) + `
  <div class="card" style="padding:0;overflow:hidden"><div class="cal">${["Isn", "Sel", "Rab", "Kha", "Jum", "Sab", "Ahd"].map(d => `<div class="h">${d}</div>`).join("")}
  ${cells.map(d => `<div class="d ${ymd(d).slice(0, 7) !== calMonth ? "o" : ""} ${ymd(d) === today() ? "t" : ""} ${canAdd ? "add" : ""}" ${canAdd ? `onclick="if(event.target===this||event.target.classList.contains('n'))eventForm(null,'${ymd(d)}')"` : ""}>
    <span class="n">${d.getDate()}</span>${evOn(d).map(e => `<span class="ev ${new Date(e.ends_at || e.starts_at) < new Date() ? "past" : ""}" onclick="showEvent('${e.id}')" title="${esc(e.title)}">${esc(e.title)}</span>`).join("")}</div>`).join("")}</div></div>
  <div class="card" style="margin-top:16px"><h2>Senarai program</h2>${D.events.length ? D.events.slice().reverse().map(evRow).join("") : `<div class="empty">Belum ada program.</div>`}</div>`;
}
function gcalLink(e) {
  const f = d => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = e.ends_at || new Date(new Date(e.starts_at).getTime() + 2 * 3600e3).toISOString();
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title)}&dates=${f(e.starts_at)}/${f(end)}&location=${encodeURIComponent(e.location || "")}&details=${encodeURIComponent((e.description || "") + "\n" + CLUB.name)}`;
}
function showEvent(id) {
  const e = D.events.find(x => x.id === id), sp = evSpent(id), tx = D.tx.filter(t => t.event_id === id);
  const canEdit = can("president", "secretary", "treasurer"), canDel = can("president", "secretary");
  modal(`<div class="row sp"><h2>${esc(e.title)}</h2><button class="btn s" onclick="closeModal()">Tutup</button></div>
    <p class="muted">${fmtDT(e.starts_at)}${e.ends_at ? " – " + fmtDT(e.ends_at) : ""}${e.location ? " · " + esc(e.location) : ""}</p>
    ${e.description ? `<p>${esc(e.description)}</p>` : ""}
    ${e.budget_cents ? `<div class="kpi"><div class="l">Bajet</div><div class="v" style="font-size:20px">${MYR(sp)} / ${MYR(e.budget_cents)}</div><div class="h">Baki ${MYR(e.budget_cents - sp)}</div></div>` : ""}
    <h2 style="margin-top:16px">Transaksi program (${tx.length})</h2>${tx.map(t => `<div class="small row sp" style="padding:4px 0"><span>#${t.id} ${esc(t.category)} ${pill(t.status)}</span><b class="${t.type === "income" ? "in" : "out"}">${MYR(t.amount_cents)}</b></div>`).join("") || `<div class="small muted">Tiada.</div>`}
    <div class="row" style="margin-top:16px;flex-wrap:wrap"><a class="btn" href="${gcalLink(e)}" target="_blank" rel="noopener">Tambah ke Google Calendar</a>${canEdit ? `<button class="btn" onclick="eventForm('${id}')">Edit</button>` : ""}${canDel ? `<button class="btn d" onclick="deleteEvent('${id}')">Padam</button>` : ""}</div>`);
}
function eventForm(id, date) {
  const e = id ? D.events.find(x => x.id === id) : null;
  const loc = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
  modal(`<div class="row sp"><h2>${e ? "Edit program" : "Program baru"}</h2><button class="btn s" onclick="closeModal()">Tutup</button></div>
  <form class="form" onsubmit="saveEvent(event,'${id || ""}')">
    <div class="full"><label>Nama program</label><input id="ev-t" required maxlength="100" value="${esc(e?.title || "")}"></div>
    <div><label>Mula</label><input id="ev-s" type="datetime-local" required value="${e ? loc(e.starts_at) : (date || today()) + "T09:00"}"></div>
    <div><label>Tamat</label><input id="ev-e" type="datetime-local" value="${e?.ends_at ? loc(e.ends_at) : (date || today()) + "T17:00"}"></div>
    <div><label>Lokasi</label><input id="ev-l" maxlength="120" value="${esc(e?.location || "")}"></div>
    <div><label>Bajet (RM)</label><input id="ev-b" inputmode="decimal" value="${e ? (e.budget_cents / 100).toFixed(2) : ""}" placeholder="0.00"></div>
    <div class="full"><label>Penerangan</label><textarea id="ev-d" rows="3" maxlength="1000">${esc(e?.description || "")}</textarea></div>
    <div class="full"><button class="btn p">Simpan</button></div></form>`);
}
async function saveEvent(ev, id) {
  ev.preventDefault();
  const s = new Date($("ev-s").value), en = $("ev-e").value ? new Date($("ev-e").value) : null;
  if (en && en < s) return toast("Tarikh tamat sebelum mula");
  const row = {title: $("ev-t").value.trim(), starts_at: s.toISOString(), ends_at: en ? en.toISOString() : null, location: $("ev-l").value.trim() || null,
    budget_cents: $("ev-b").value ? (toCents($("ev-b").value) || 0) : 0, description: $("ev-d").value.trim() || null};
  const r = id ? await sb.from("events").update(row).eq("id", id) : await sb.from("events").insert({...row, club_id: CLUB.id, created_by: ME.id});
  if (fail(r.error)) return;
  closeModal(); await loadClub(); route(); toast("Program disimpan");
}
async function deleteEvent(id) {
  if (!confirm("Padam program ni? Transaksi berkaitan kekal, cuma tak lagi dikaitkan.")) return;
  if (fail((await sb.from("events").delete().eq("id", id)).error)) return;
  closeModal(); await loadClub(); route(); toast("Dipadam");
}

/* add transaction */
let draft = {type: "expense", file: null, preview: null};
function pAdd() {
  return header("Rekod transaksi", `${esc(CLUB.name)} · resit wajib, presiden akan semak`) + `
  <form class="card form" onsubmit="submitTx(event)" style="max-width:760px">
    <div class="full"><label>Jenis</label><div class="seg"><button type="button" class="${draft.type === "income" ? "on inb" : ""}" onclick="draft.type='income';route()">Duit masuk</button><button type="button" class="${draft.type === "expense" ? "on outb" : ""}" onclick="draft.type='expense';route()">Duit keluar</button></div></div>
    <div><label>Jumlah (RM)</label><input id="f-amt" inputmode="decimal" placeholder="0.00" required></div>
    <div><label>Tarikh</label><input id="f-date" type="date" value="${today()}" max="${today()}" required></div>
    <div><label>Kategori</label><input id="f-cat" list="cats" required maxlength="40" placeholder="F&B, Venue…"><datalist id="cats">${["F&B", "Venue", "Merchandise", "Transport", "Sponsorship", "Membership fee", "Printing", "Grant", "Supplies"].map(c => `<option>${c}</option>`).join("")}</datalist></div>
    <div><label>Program</label><select id="f-ev"><option value="">Tiada (operasi am)</option>${D.events.slice().reverse().map(e => `<option value="${e.id}">${esc(e.title)}</option>`).join("")}</select></div>
    <div class="full"><label>Penerangan</label><textarea id="f-desc" rows="2" maxlength="200" required placeholder="Contoh: Katering AGM 60 pax"></textarea></div>
    <div class="full"><label>Resit / invois (wajib, gambar atau PDF)</label><div class="drop" onclick="$('f-file').click()">${draft.preview ? `<img src="${draft.preview}" alt="">` : draft.file ? "📄 " + esc(draft.file.name) : "📎 Tekan untuk upload atau ambil gambar resit"}</div>
      <input id="f-file" type="file" accept="image/*,application/pdf" hidden onchange="pickReceipt(this)"></div>
    <div class="full row sp"><span class="small muted">Tak boleh dipadam selepas dihantar. Silap? Guna Betulkan.</span><button class="btn p" id="f-go">Hantar untuk kelulusan</button></div>
  </form>`;
}
function pickReceipt(inp) {
  const f = inp.files[0]; if (!f) return;
  if (f.size > 10 * 1024 * 1024) return toast("Fail terlalu besar (max 10MB)");
  if (f.type === "application/pdf") { if (f.size > 5 * 1024 * 1024) return toast("PDF max 5MB"); draft.file = f; draft.preview = null; return route(); }
  const img = new Image(), rd = new FileReader();
  rd.onload = () => { img.onload = () => { const c = document.createElement("canvas"), k = Math.min(1, 1600 / Math.max(img.width, img.height)); c.width = img.width * k; c.height = img.height * k;
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); draft.preview = c.toDataURL("image/jpeg", .8); c.toBlob(b => { draft.file = new File([b], "receipt.jpg", {type: "image/jpeg"}); route(); }, "image/jpeg", .8); }; img.src = rd.result; };
  rd.readAsDataURL(f);
}
async function submitTx(e) {
  e.preventDefault();
  const amt = toCents($("f-amt").value); if (!amt) return toast("Jumlah tak sah");
  if (!draft.file) return toast("Resit wajib");
  const vals = {cat: $("f-cat").value.trim(), desc: $("f-desc").value.trim(), date: $("f-date").value, ev: $("f-ev").value || null};
  $("f-go").disabled = true; $("f-go").textContent = "Menghantar…";
  const path = `${CLUB.id}/${crypto.randomUUID()}.${draft.file.type === "application/pdf" ? "pdf" : "jpg"}`;
  const up = await sb.storage.from("receipts").upload(path, draft.file, {contentType: draft.file.type});
  if (fail(up.error, "Upload resit gagal")) { $("f-go").disabled = false; $("f-go").textContent = "Hantar untuk kelulusan"; return; }
  const {data, error} = await sb.from("transactions").insert({club_id: CLUB.id, event_id: vals.ev, type: draft.type, amount_cents: amt, category: vals.cat,
    description: vals.desc, txn_date: vals.date, receipt_path: path, created_by: ME.id}).select().single();
  if (fail(error)) { $("f-go").disabled = false; return; }
  draft = {type: "expense", file: null, preview: null};
  await loadClub(); location.hash = "transactions"; toast(`#${data.id} dihantar kepada presiden`);
}

function pApprovals() {
  const rows = D.tx.filter(t => t.status === "submitted");
  return header("Kelulusan", "Semak resit sebelum lulus") + `<div class="card">${txTable(rows, t => t.created_by === ME.id ? `<span class="small muted">Transaksi sendiri</span>` :
    `<div class="row"><button class="btn s p" onclick="decide(${t.id},true)">Lulus</button><button class="btn s d" onclick="decide(${t.id},false)">Tolak</button></div>`)}</div>`;
}
async function decide(id, ok) {
  let note = null;
  if (!ok) { note = prompt("Sebab tolak?"); if (!note) return; }
  if (fail((await sb.rpc("decide_transaction", {p_id: id, p_approve: ok, p_note: note})).error)) return;
  await loadClub(); route(); toast(ok ? "Diluluskan" : "Ditolak");
}

let filt = {q: "", status: "", type: ""};
function pTransactions() {
  let rows = D.tx;
  if (filt.status) rows = rows.filter(t => t.status === filt.status);
  if (filt.type) rows = rows.filter(t => t.type === filt.type);
  if (filt.q) rows = rows.filter(t => (t.category + " " + t.description).toLowerCase().includes(filt.q.toLowerCase()));
  const canFix = t => can("treasurer") && t.status === "approved" && !t.reverses_id && !D.tx.some(x => x.reverses_id === t.id && x.status !== "rejected");
  return header("Transaksi", "Tiada padam, hanya pembetulan", `<button class="btn" onclick="exportCSV()">Export CSV</button>`) + `
  <div class="card"><div class="row noprint" style="margin-bottom:12px;flex-wrap:wrap">
    <input id="q" style="max-width:260px" placeholder="Cari…" value="${esc(filt.q)}" oninput="filt.q=this.value;clearTimeout(window._q);window._q=setTimeout(()=>{route();const i=$('q');i.focus();i.setSelectionRange(99,99)},250)">
    <select style="width:auto" onchange="filt.status=this.value;route()"><option value="">Semua status</option>${["submitted", "approved", "rejected"].map(s => `<option value="${s}" ${filt.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
    <select style="width:auto" onchange="filt.type=this.value;route()"><option value="">Masuk & keluar</option><option value="income" ${filt.type === "income" ? "selected" : ""}>Masuk</option><option value="expense" ${filt.type === "expense" ? "selected" : ""}>Keluar</option></select>
  </div>${txTable(rows, t => canFix(t) ? `<button class="btn s" onclick="reverseTx(${t.id})">Betulkan</button>` : "")}</div>`;
}
async function reverseTx(id) {
  const why = prompt(`Sebab pembetulan #${id}?`); if (!why) return;
  if (fail((await sb.rpc("reverse_transaction", {p_id: id, p_reason: why})).error)) return;
  await loadClub(); route(); toast("Pembetulan dihantar untuk kelulusan");
}
function exportCSV() {
  const rows = [["id", "date", "program", "type", "amount_rm", "category", "description", "status", "recorded_by", "decided_by", "note", "reverses"]]
    .concat(D.tx.slice().reverse().map(t => [t.id, t.txn_date, (D.events.find(e => e.id === t.event_id) || {}).title || "", t.type, (t.amount_cents / 100).toFixed(2), t.category, t.description, t.status, person(t.created_by), t.decided_by ? person(t.decided_by) : "", t.decision_note || "", t.reverses_id || ""]));
  const csv = "\ufeff" + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], {type: "text/csv"})); a.download = `${CLUB.name}_transactions.csv`; a.click();
}

let repMonth = today().slice(0, 7);
function pReport() {
  const ok = D.tx.filter(t => t.status === "approved");
  const before = ok.filter(t => t.txn_date < repMonth + "-01"), rows = ok.filter(t => t.txn_date.startsWith(repMonth)).sort((a, b) => a.txn_date.localeCompare(b.txn_date));
  const open = CLUB.opening_cents + before.reduce((a, t) => a + (t.type === "income" ? t.amount_cents : -t.amount_cents), 0);
  const inc = rows.filter(t => t.type === "income").reduce((a, t) => a + t.amount_cents, 0), exp = rows.filter(t => t.type === "expense").reduce((a, t) => a + t.amount_cents, 0);
  const label = new Date(repMonth + "-01").toLocaleString("ms-MY", {month: "long", year: "numeric"});
  return header("Laporan", "Penyata bulanan, sedia untuk HEP", `<input type="month" style="width:auto" value="${repMonth}" onchange="repMonth=this.value;route()"><button class="btn p" onclick="window.print()">Cetak / PDF</button>`) + `
  <div class="card" style="max-width:860px"><div class="row sp"><div><h1 style="font-size:22px">${esc(CLUB.name)}</h1><div class="muted">Penyata kewangan · ${label}</div></div><div class="small muted r">Dijana ${today()}<br>Transaksi lulus sahaja</div></div>
  <table style="max-width:380px;margin:20px 0"><tbody><tr><td>Baki awal</td><td class="r">${MYR(open)}</td></tr><tr><td>Jumlah masuk</td><td class="r in">${MYR(inc)}</td></tr><tr><td>Jumlah keluar</td><td class="r out">${MYR(exp)}</td></tr><tr><td><b>Baki akhir</b></td><td class="r"><b>${MYR(open + inc - exp)}</b></td></tr></tbody></table>
  ${txTable(rows)}
  <div class="row sp" style="margin-top:50px"><div style="width:42%;border-top:1px solid var(--ink);padding-top:6px" class="small">Disediakan oleh (Bendahari)</div><div style="width:42%;border-top:1px solid var(--ink);padding-top:6px" class="small">Disahkan oleh (Presiden)</div></div></div>`;
}

function pMembers() {
  const pres = can("president");
  const roleSel = (cur, uid) => `<select style="width:auto" onchange="setRole('${uid}',this.value)">${["president", "treasurer", "secretary", "member"].map(r => `<option value="${r}" ${r === cur ? "selected" : ""}>${ROLE_LABEL[r]}</option>`).join("")}</select>`;
  return header("Ahli & jemputan", esc(CLUB.name)) + `
  <div class="grid g2"><div class="card"><h2>Ahli (${D.members.length})</h2><table><tbody>${D.members.map(m => `<tr><td><b>${esc(m.profiles?.full_name || "-")}</b><div class="small muted">${esc(m.profiles?.email || "")}</div></td>
    <td>${pres && m.user_id !== ME.id ? roleSel(m.role, m.user_id) : ROLE_LABEL[m.role]}</td><td>${pres && m.user_id !== ME.id ? `<button class="btn s d" onclick="removeMember('${m.user_id}')">Buang</button>` : ""}</td></tr>`).join("")}</tbody></table></div>
  ${pres ? `<div class="card"><h2>Jemput ahli</h2><form class="form" onsubmit="invite(event)" style="grid-template-columns:1fr"><div><label>Email Google</label><input id="iv-e" type="email" required></div>
    <div><label>Role</label><select id="iv-r"><option value="member">Ahli (baca sahaja)</option><option value="treasurer">Bendahari</option><option value="secretary">Setiausaha</option><option value="president">Presiden</option></select></div><button class="btn p">Jemput</button></form>
    <h2 style="margin-top:18px">Jemputan belum diterima</h2>${D.invites.map(i => `<div class="row sp small" style="padding:6px 0"><span>${esc(i.email)} · ${ROLE_LABEL[i.role]}</span><button class="btn s" onclick="revoke('${i.id}')">Batal</button></div>`).join("") || `<div class="small muted">Tiada.</div>`}
    <p class="small muted">Orang yang dijemput cuma perlu log masuk dengan email tu. Akses diberi secara automatik.</p></div>` : `<div class="card"><h2>Role kau</h2><p>${ROLE_LABEL[ROLE]}</p><p class="small muted">Nak tukar role? Minta presiden club.</p></div>`}</div>`;
}
async function invite(e) {
  e.preventDefault();
  const r = await sb.from("invites").insert({club_id: CLUB.id, email: $("iv-e").value.trim().toLowerCase(), role: $("iv-r").value, invited_by: ME.id});
  if (fail(r.error, r.error?.code === "23505" ? "Email ni dah dijemput" : null)) return;
  await loadClub(); route(); toast("Jemputan dihantar. Suruh dia log masuk.");
}
async function revoke(id) { if (fail((await sb.from("invites").delete().eq("id", id)).error)) return; await loadClub(); route(); }
async function setRole(uid, role) { if (fail((await sb.from("memberships").update({role}).eq("club_id", CLUB.id).eq("user_id", uid)).error)) return; await loadClub(); route(); toast("Role dikemas kini"); }
async function removeMember(uid) { if (!confirm("Buang ahli ni dari club?")) return; if (fail((await sb.from("memberships").delete().eq("club_id", CLUB.id).eq("user_id", uid)).error)) return; await loadClub(); route(); }

async function pAudit() {
  const {data, error} = await sb.from("audit_log").select("*").eq("club_id", CLUB.id).order("at", {ascending: false}).limit(100);
  if (error) return header("Audit log", "") + `<div class="card empty">Tiada akses.</div>`;
  return header("Audit log", "Semua tindakan direkod automatik oleh database") + `<div class="card"><table><thead><tr><th>Masa</th><th>Pengguna</th><th>Tindakan</th><th>Butiran</th></tr></thead><tbody>${data.map(a => `<tr><td class="small nw">${fmtDT(a.at)}</td><td>${esc(person(a.user_id))}</td><td><span class="pill" style="background:#f1eee9">${esc(a.action)}</span></td><td class="small">${esc(JSON.stringify(a.detail || {}).slice(0, 140))}</td></tr>`).join("")}</tbody></table></div>`;
}

async function pAdmin() {
  const {data: mem} = await sb.from("memberships").select("club_id, role");
  return header("Admin SRC", "Urus semua club") + `<div class="grid g2"><div class="card"><h2>Semua club (${CLUBS.length})</h2><table><tbody>${CLUBS.map(c => `<tr><td><b>${esc(c.name)}</b></td><td class="small muted">${(mem || []).filter(m => m.club_id === c.id).length} ahli</td><td><button class="btn s" onclick="selectClub('${c.id}');location.hash='dashboard'">Buka</button></td></tr>`).join("")}</tbody></table></div>
  <div class="card"><h2>Daftar club baru</h2><form class="form" style="grid-template-columns:1fr" onsubmit="createClub(event)"><div><label>Nama club</label><input id="cc-n" required maxlength="80"></div>
  <div><label>Baki awal (RM)</label><input id="cc-o" inputmode="decimal" placeholder="0.00"></div><div><label>Email presiden</label><input id="cc-p" type="email" required></div><button class="btn p">Daftar club</button>
  <p class="small muted">Presiden akan dapat akses bila log masuk, dan boleh jemput bendahari serta ahli sendiri.</p></form></div></div>`;
}
async function createClub(e) {
  e.preventDefault();
  const {data, error} = await sb.rpc("create_club", {p_name: $("cc-n").value, p_opening_cents: $("cc-o").value ? toCents($("cc-o").value) || 0 : 0, p_president_email: $("cc-p").value});
  if (fail(error)) return;
  await boot(); await selectClub(data); location.hash = "admin"; toast("Club didaftarkan");
}

/* ---------- router ---------- */
const RENDER = {dashboard: pDashboard, calendar: pCalendar, add: pAdd, approvals: pApprovals, transactions: pTransactions, report: pReport, members: pMembers, audit: pAudit, admin: pAdmin};
async function route() {
  if (!ME) return;
  let k = location.hash.slice(1) || "dashboard";
  if (!PAGES[k] || !PAGES[k].show()) k = CLUB ? "dashboard" : (ME.is_super_admin ? "admin" : "dashboard");
  nav(k);
  if (!CLUB && k !== "admin") { $("main").innerHTML = header("Tiada club", "Daftar club pertama di Admin SRC."); return; }
  $("main").innerHTML = await RENDER[k]();
}
window.addEventListener("hashchange", route);
$("clubSel").onchange = e => selectClub(e.target.value);
boot();
