CREATE POLICY "Admins read wholesale images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'wholesale-images' AND public.is_active_admin(auth.uid()));

CREATE POLICY "Admins upload wholesale images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'wholesale-images' AND public.is_active_admin(auth.uid()));

CREATE POLICY "Admins update wholesale images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'wholesale-images' AND public.is_active_admin(auth.uid()))
  WITH CHECK (bucket_id = 'wholesale-images' AND public.is_active_admin(auth.uid()));

CREATE POLICY "Admins delete wholesale images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'wholesale-images' AND public.is_active_admin(auth.uid()));