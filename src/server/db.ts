import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(config.dataDir, 'vestiaire.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    pin TEXT NOT NULL,
    title TEXT NOT NULL,
    scenario_id TEXT NOT NULL,
    scenario_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at INTEGER NOT NULL,
    opened_at INTEGER,
    launched_at INTEGER,
    paused_at INTEGER,
    ended_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    started_at INTEGER,
    finished_at INTEGER,
    paused_ms INTEGER NOT NULL DEFAULT 0,
    score INTEGER NOT NULL DEFAULT 0,
    current_room INTEGER NOT NULL DEFAULT 0,
    final_code_ok INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    token_hash TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    joined_at INTEGER,
    last_seen INTEGER,
    muted_until INTEGER,
    quiz_score INTEGER,
    quiz_finished_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    author_kind TEXT NOT NULL DEFAULT 'player',
    body TEXT NOT NULL,
    status TEXT NOT NULL,
    moderation_json TEXT,
    client_id TEXT,
    created_at INTEGER NOT NULL,
    published_at INTEGER,
    UNIQUE(team_id, client_id)
  );

  CREATE TABLE IF NOT EXISTS progress (
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    room_id TEXT NOT NULL,
    questions_json TEXT NOT NULL DEFAULT '{}',
    attempts INTEGER NOT NULL DEFAULT 0,
    hint_used INTEGER NOT NULL DEFAULT 0,
    solved_at INTEGER,
    exit_code TEXT,
    PRIMARY KEY(team_id, room_id)
  );

  CREATE TABLE IF NOT EXISTS quiz_answers (
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL,
    choice INTEGER NOT NULL,
    correct INTEGER NOT NULL,
    answered_at INTEGER NOT NULL,
    PRIMARY KEY(player_id, question_id)
  );

  CREATE TABLE IF NOT EXISTS research (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    room_id TEXT NOT NULL,
    player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    sources_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    comment TEXT,
    verdict_json TEXT,
    submitted_at INTEGER NOT NULL,
    validated_at INTEGER,
    UNIQUE(team_id, room_id)
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0,
    UNIQUE(message_id, player_id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    team_id TEXT,
    player_id TEXT,
    type TEXT NOT NULL,
    payload_json TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_teams_game ON teams(game_id);
  CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_id);
  CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
  CREATE INDEX IF NOT EXISTS idx_messages_team ON messages(team_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_game ON messages(game_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_progress_team ON progress(team_id);
  CREATE INDEX IF NOT EXISTS idx_research_team ON research(team_id, room_id);
  CREATE INDEX IF NOT EXISTS idx_events_game ON events(game_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_reports_game ON reports(game_id, created_at);
`);

export function withTransaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw error;
  }
}

export function closeDb(): void {
  db.close();
}
