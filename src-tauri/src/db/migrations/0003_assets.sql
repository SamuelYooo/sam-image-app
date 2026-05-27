CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (
    kind IN ('image', 'icon', 'storyboard_frame', 'reference', 'pdf', 'zip', 'json_export')
  ),
  uri TEXT NOT NULL,
  thumbnail_uri TEXT,
  prompt_text TEXT,
  negative_prompt TEXT,
  model_profile_id TEXT,
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  seed INTEGER,
  source_task_id TEXT,
  project_id TEXT,
  workflow_id TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assets_kind ON assets(kind);
CREATE INDEX IF NOT EXISTS idx_assets_source_task ON assets(source_task_id);
CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
CREATE INDEX IF NOT EXISTS idx_assets_workflow ON assets(workflow_id);
CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at);

UPDATE app_meta
SET value = '3',
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'schema_version';
