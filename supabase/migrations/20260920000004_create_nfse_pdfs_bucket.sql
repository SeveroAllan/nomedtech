-- Bucket publico para armazenar PDFs das NFS-e emitidas
INSERT INTO storage.buckets (id, name, public)
  VALUES ('nfse-pdfs', 'nfse-pdfs', true)
  ON CONFLICT (id) DO UPDATE SET public = true;

-- Politica: leitura publica para qualquer um que tenha a URL
DROP POLICY IF EXISTS "public_read_nfse_pdfs" ON storage.objects;
CREATE POLICY "public_read_nfse_pdfs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'nfse-pdfs');

-- Politica: somente service role pode escrever
DROP POLICY IF EXISTS "service_role_upload_nfse_pdfs" ON storage.objects;
CREATE POLICY "service_role_upload_nfse_pdfs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'nfse-pdfs');
