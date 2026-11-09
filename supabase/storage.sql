-- Private receipts bucket. Path format: <club_id>/<uuid>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

drop policy if exists receipts_read on storage.objects;
create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.can_view(((storage.foldername(name))[1])::uuid));

drop policy if exists receipts_upload on storage.objects;
create policy receipts_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.has_role(((storage.foldername(name))[1])::uuid, array['treasurer']));
-- No update/delete policies: receipts are permanent evidence.
