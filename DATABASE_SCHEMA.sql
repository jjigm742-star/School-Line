-- Informational copy of the schema auto-created by durable_store.js.
-- The application creates these objects automatically at startup.

CREATE TABLE IF NOT EXISTS school_line_meta (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS school_line_matches (
  match_id TEXT PRIMARY KEY,
  stats_version TEXT NOT NULL,
  balance_version TEXT NOT NULL,
  game_version TEXT NOT NULL,
  build_id TEXT,
  roster_version TEXT,
  ended_at TIMESTAMPTZ NOT NULL,
  record JSONB NOT NULL,
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS school_line_matches_stats_version_idx ON school_line_matches(stats_version, ended_at);
CREATE INDEX IF NOT EXISTS school_line_matches_ended_at_idx ON school_line_matches(ended_at);

CREATE TABLE IF NOT EXISTS school_line_player_accounts (
  account_id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  pin TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
