CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO app_meta (key, value)
VALUES ('schema_version', '1')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS model_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  capability TEXT NOT NULL CHECK (capability IN ('text', 'image', 'multimodal')),
  base_url TEXT NOT NULL DEFAULT '',
  api_key_ref TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL,
  endpoints_json TEXT NOT NULL DEFAULT '{}',
  request_defaults_json TEXT NOT NULL DEFAULT '{}',
  is_default_text INTEGER NOT NULL DEFAULT 0 CHECK (is_default_text IN (0, 1)),
  is_default_image INTEGER NOT NULL DEFAULT 0 CHECK (is_default_image IN (0, 1)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_model_profiles_capability ON model_profiles(capability);
CREATE INDEX IF NOT EXISTS idx_model_profiles_enabled ON model_profiles(enabled);

CREATE TABLE IF NOT EXISTS prompt_assets (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT,
  source_url TEXT,
  license TEXT,
  author TEXT,
  categories_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  use_cases_json TEXT NOT NULL DEFAULT '[]',
  preview_images_json TEXT NOT NULL DEFAULT '[]',
  reference_images_json TEXT NOT NULL DEFAULT '[]',
  language TEXT NOT NULL DEFAULT 'mixed',
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  usage_count INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_assets_source_source_id
ON prompt_assets(source, source_id)
WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prompt_assets_source ON prompt_assets(source);
CREATE INDEX IF NOT EXISTS idx_prompt_assets_favorite ON prompt_assets(favorite);
