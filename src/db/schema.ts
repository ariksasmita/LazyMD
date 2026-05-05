// src/db/schema.ts

export const SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS notes (
    id              TEXT PRIMARY KEY NOT NULL,
    title           TEXT NOT NULL DEFAULT '',
    content         TEXT NOT NULL DEFAULT '',
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    gdrive_file_id  TEXT,
    gdrive_modified INTEGER,
    is_deleted      INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_notes_updated
    ON notes(updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_notes_gdrive
    ON notes(gdrive_file_id)
    WHERE gdrive_file_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_notes_deleted
    ON notes(is_deleted)
    WHERE is_deleted = 1;
`
