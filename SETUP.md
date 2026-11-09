# Setup Kas v2 (Google login + banyak club)

Masa: lebih kurang 20 minit. Semua percuma (Supabase Free + Google Cloud + GitHub Pages).

## 1. Supabase
1. Daftar di supabase.com, kemudian **New project** (region: Singapore). Simpan password database.
2. **SQL Editor**: paste isi `supabase/schema.sql`, tekan Run. Kemudian paste `supabase/storage.sql`, tekan Run.
3. **Project Settings > API**: salin `Project URL` dan `anon public key`.

## 2. Google login
1. console.cloud.google.com, buat project baru.
2. **APIs & Services > OAuth consent screen**: External, isi nama app dan email.
3. **Credentials > Create credentials > OAuth client ID**: Web application.
   - Authorized redirect URI: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
4. Salin Client ID dan Client Secret.
5. Supabase: **Authentication > Sign In / Providers > Google**: enable, paste Client ID dan Secret.
6. Supabase: **Authentication > URL Configuration**:
   - Site URL: `https://hakimcorleone.github.io/kas-club-treasury/app/`
   - Redirect URLs: tambah URL yang sama.

## 3. Sambung app
Edit `app/config.js`: isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY`. Anon key memang selamat untuk public, data dilindungi RLS.
Optional: `ALLOWED_DOMAINS: ["<domain email UNITEN>"]` untuk hadkan login.

## 4. Jadikan diri admin SRC
1. Buka app dan log masuk dengan Google sekali.
2. Supabase SQL Editor:
   ```sql
   update profiles set is_super_admin = true where email = 'email-kau@gmail.com';
   ```
3. Refresh app. Menu **Admin SRC** akan muncul.

## 5. Guna
- Admin SRC: daftar club + email presiden.
- Presiden log masuk, kemudian jemput bendahari, setiausaha dan ahli ikut email Google.
- Orang yang dijemput hanya perlu log masuk. Mereka cuma nampak club sendiri.

## Peraturan akses (dikuatkuasa oleh database, bukan UI)
- Setiap orang hanya nampak club yang dia ahli. Admin SRC nampak semua (baca sahaja).
- Bendahari: rekod transaksi (resit wajib), buat pembetulan.
- Presiden: lulus atau tolak (sebab wajib), jemput atau buang ahli, tukar role. Tak boleh lulus transaksi sendiri.
- Presiden, setiausaha, bendahari: tambah dan edit program dalam kalendar.
- Transaksi dan resit tak boleh dipadam. Semua tindakan masuk audit log.

## Test
`supabase/test/` ada 65 ujian RLS (jalan atas Postgres biasa): `cat setup.sql ../schema.sql | psql`, kemudian `python3 test_rls.py`.
