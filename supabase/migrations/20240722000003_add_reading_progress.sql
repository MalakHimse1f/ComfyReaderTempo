-- Add reading_progress column to documents table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'documents' AND column_name = 'reading_progress') THEN
        ALTER TABLE documents ADD COLUMN reading_progress JSONB;
    END IF;
END $$;

-- Create index on reading_progress for better query performance
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_documents_reading_progress') THEN
        CREATE INDEX idx_documents_reading_progress ON documents USING gin(reading_progress);
    END IF;
END $$;

-- Enable realtime for the documents table
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;

ALTER PUBLICATION supabase_realtime ADD TABLE documents;
