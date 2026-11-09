# Setup Kas v2 (banyak club, login email + password)

Masa: lebih kurang 10 minit. Percuma (Supabase Free + GitHub Pages).

## 1. Supabase
1. Daftar di supabase.com, kemudian **New project** (region: Singapore). Simpan password database.
2. **SQL Editor**: paste isi `supabase/schema.sql`, tekan Run. Kemudian paste `supabase/storage.sql`, tekan Run.
3. **Project Settings > API**: salin `Project URL` dan `anon public key`.
4. **Authentication > URL Configuration**:
   - Site URL: `https://hakimcorleone.github.io/kas-club-treasury/app/`
   - Redirect URLs: tambah URL yang sama.
5. **Authentication > Sign In / Providers > Email**: pastikan **Confirm email** ON. Jemputan club hanya diberi kepada email yang dah disahkan.

Nota: email percuma Supabase terhad (beberapa email sejam). Untuk ramai pengguna, sambung SMTP sendiri di Authentication > Emails > SMTP.

## 2. Sambung app
Edit `app/config.js`: isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY`. Anon key memang selamat untuk public, data dilindungi RLS.
Optional: `ALLOWED_DOMAINS: ["<domain email UNITEN>"]` untuk hadkan pendaftaran.

## 3. Jadikan diri admin SRC
1. Buka app, **Daftar akaun**, sahkan email, log masuk.
2. Supabase SQL Editor:
   ```sql
   update profiles set is_super_admin = true where email = 'email-kau@gmail.com';
   ```
3. Refresh app. Menu **Admin SRC** akan muncul.

## 4. Guna
- Admin SRC: daftar club + email presiden.
- Presiden daftar akaun dengan email tu, kemudian jemput bendahari, setiausaha dan ahli ikut email.
- Orang yang dijemput daftar akaun dengan email yang sama. Akses diberi automatik. Mereka cuma nampak club sendiri.

## Peraturan akses (dikuatkuasa oleh database, bukan UI)
- Setiap orang hanya nampak club yang dia ahli. Admin SRC nampak semua (baca sahaja).
- Jemputan hanya boleh dituntut oleh email yang dah disahkan.
- Bendahari: rekod transaksi (resit wajib), buat pembetulan.
- Presiden: lulus atau tolak (sebab wajib), jemput atau buang ahli, tukar role. Tak boleh lulus transaksi sendiri.
- Presiden, setiausaha, bendahari: tambah dan edit program dalam kalendar.
- Transaksi dan resit tak boleh dipadam. Semua tindakan masuk audit log.

## Google login (nanti)
Buat OAuth Client di Google Cloud (redirect `https://<ref>.supabase.co/auth/v1/callback`), enable Google provider dalam Supabase, kemudian tambah butang Google.

## Test
`supabase/test/` ada 69 ujian RLS (Postgres biasa): `cat setup.sql ../schema.sql | psql`, kemudian `python3 test_rls.py`.
