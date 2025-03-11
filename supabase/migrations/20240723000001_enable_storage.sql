-- Enable Storage for documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Set up security policies for the documents bucket
DROP POLICY IF EXISTS "Allow users to select their own documents" ON storage.objects;
CREATE POLICY "Allow users to select their own documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'documents' AND (auth.uid() = CAST(SPLIT_PART(name, '/', 1) AS uuid)));

DROP POLICY IF EXISTS "Allow users to insert their own documents" ON storage.objects;
CREATE POLICY "Allow users to insert their own documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'documents' AND (auth.uid() = CAST(SPLIT_PART(name, '/', 1) AS uuid)));

DROP POLICY IF EXISTS "Allow users to update their own documents" ON storage.objects;
CREATE POLICY "Allow users to update their own documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'documents' AND (auth.uid() = CAST(SPLIT_PART(name, '/', 1) AS uuid)));

DROP POLICY IF EXISTS "Allow users to delete their own documents" ON storage.objects;
CREATE POLICY "Allow users to delete their own documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'documents' AND (auth.uid() = CAST(SPLIT_PART(name, '/', 1) AS uuid)));
