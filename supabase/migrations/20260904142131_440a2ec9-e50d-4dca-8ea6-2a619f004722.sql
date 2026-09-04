CREATE POLICY "Admins read wholesale documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'wholesale-documents' AND public.is_active_admin(auth.uid()));

CREATE POLICY "Admins upload wholesale documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'wholesale-documents' AND public.is_active_admin(auth.uid()));

CREATE POLICY "Admins update wholesale documents" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'wholesale-documents' AND public.is_active_admin(auth.uid()))
  WITH CHECK (bucket_id = 'wholesale-documents' AND public.is_active_admin(auth.uid()));

CREATE POLICY "Admins delete wholesale documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'wholesale-documents' AND public.is_active_admin(auth.uid()));