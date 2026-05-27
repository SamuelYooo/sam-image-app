CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('free_generation', 'icon_pack', 'storyboard', 'batch', 'workflow')),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS storyboard_characters (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  appearance TEXT NOT NULL,
  personality TEXT,
  reference_asset_ids_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS storyboard_scenes (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  location TEXT NOT NULL,
  time_of_day TEXT,
  mood TEXT,
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS storyboard_shots (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id TEXT REFERENCES storyboard_scenes(id) ON DELETE SET NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  framing TEXT NOT NULL,
  angle TEXT NOT NULL,
  movement TEXT NOT NULL,
  duration_sec INTEGER,
  transition TEXT,
  asset_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'generating', 'done', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(type);
CREATE INDEX IF NOT EXISTS idx_storyboard_characters_project ON storyboard_characters(project_id);
CREATE INDEX IF NOT EXISTS idx_storyboard_scenes_project ON storyboard_scenes(project_id, order_index);
CREATE INDEX IF NOT EXISTS idx_storyboard_shots_project ON storyboard_shots(project_id, order_index);
CREATE INDEX IF NOT EXISTS idx_storyboard_shots_scene ON storyboard_shots(scene_id);

UPDATE app_meta
SET value = '4',
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'schema_version';
