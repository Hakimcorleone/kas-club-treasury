// Test-only mock of supabase-js so every page can render without a backend.
window.MOCK_ROLE = window.MOCK_ROLE || "president";
(function () {
  const C1 = "c1", me = "u-me", d = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString(); };
  const DB = {
    profiles: [{id: me, email: "me@uniten.edu.my", full_name: "Haziq", is_super_admin: true, avatar_url: null}],
    clubs: [{id: C1, name: "3ESC", opening_cents: 100000}, {id: "c2", name: "Rakan Muda", opening_cents: 0}],
    memberships: [{club_id: C1, user_id: me, role: window.MOCK_ROLE, profiles: {full_name: "Haziq", email: "me@uniten.edu.my"}},
                  {club_id: C1, user_id: "u2", role: "treasurer", profiles: {full_name: "Aina <b>x</b>", email: "aina@uniten.edu.my"}}],
    events: [{id: "e1", club_id: C1, title: "Green Week", location: "DSS", starts_at: d(3), ends_at: d(5), budget_cents: 300000, description: "Program tenaga"},
             {id: "e2", club_id: C1, title: "AGM", location: "BW", starts_at: d(-10), ends_at: null, budget_cents: 50000}],
    transactions: [
      {id: 3, club_id: C1, event_id: "e1", type: "expense", amount_cents: 98000, category: "Merch", description: "T-shirt", txn_date: d(-1).slice(0, 10), receipt_path: "c1/a.jpg", status: "submitted", created_by: "u2"},
      {id: 2, club_id: C1, event_id: "e1", type: "expense", amount_cents: 45000, category: "F&B", description: "\u003cscript>x\u003c/script>", txn_date: d(-5).slice(0, 10), receipt_path: "c1/b.jpg", status: "approved", created_by: "u2", decided_by: me},
      {id: 1, club_id: C1, event_id: null, type: "income", amount_cents: 200000, category: "Sponsorship", description: "TNB", txn_date: d(-30).slice(0, 10), receipt_path: "c1/c.pdf", status: "approved", created_by: "u2", decided_by: me}],
    invites: [{id: "i1", club_id: C1, email: "new@uniten.edu.my", role: "member"}],
    audit_log: [{id: 1, club_id: C1, user_id: me, action: "transaction.approved", detail: {id: 2}, at: d(-1)}],
  };
  window.MOCK_CALLS = [];
  function q(table) {
    let rows = (DB[table] || []).slice(), single = false;
    const api = {
      select() { return api; }, order() { return api; }, limit() { return api; }, is() { return api; },
      eq(k, v) { rows = rows.filter(r => r[k] === undefined || r[k] === v); return api; },
      single() { single = true; return api; },
      insert(r) { window.MOCK_CALLS.push(["insert", table, r]); rows = [Object.assign({id: 99}, r)]; return api; },
      update(r) { window.MOCK_CALLS.push(["update", table, r]); return api; },
      delete() { window.MOCK_CALLS.push(["delete", table]); return api; },
      then(res) { res({data: single ? rows[0] : rows, error: null}); },
    };
    return api;
  }
  window.supabase = {createClient: () => ({
    auth: {onAuthStateChange: () => {}, signUp: async (a) => { window.MOCK_CALLS.push(['signUp', a]); return {data: {session: null}, error: null}; }, signInWithPassword: async (a) => { window.MOCK_CALLS.push(['signIn', a]); return {error: {message: 'Invalid login credentials'}}; }, resetPasswordForEmail: async () => ({error: null}), getSession: async () => ({data: {session: window.MOCK_NOSESSION ? null : {user: {id: me, email: "me@uniten.edu.my"}}}}), signOut: async () => {}, signInWithOAuth: async () => ({})},
    from: q,
    rpc: async (fn, args) => { window.MOCK_CALLS.push(["rpc", fn, args]); return {data: fn === "accept_invites" ? 0 : C1, error: null}; },
    storage: {from: () => ({createSignedUrl: async () => ({data: {signedUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw="}, error: null}), upload: async () => ({data: {}, error: null})})},
  })};
  window.KAS_CONFIG = {SUPABASE_URL: "http://mock", SUPABASE_ANON_KEY: "mock", ALLOWED_DOMAINS: [], APP_NAME: "Kas TEST"};
})();
