-- Game saves (#35 a, lib/gamesave.php): the game in her window (windowed mode = an authored story) keeps its
-- own progress apart from desktop Jun, who is shared and never in a save.
--   game_state   the game being played now, one row per user: named sections every game system writes
--                (the story engine #34, story state #35 b, …) as one JSON blob, plus the play clock.
--                `epoch` changes whenever a save is loaded or a new game starts, so a page still holding the
--                old game can't write it back over the new one. `last_load` = what "Undo last load" undoes.
--   game_saves   slots: kind auto (3, rotating) / quick (1) / named (up to 50, imports too) / before_load (5).
--                `data` = the whole save (the .jungame payload), `summary` = what a save card shows.
-- The bond gets three columns: when it was last SET by hand or by a save, from which stage, and why
-- (it otherwise only ever grows), so her prompt can feel the shift softly for a day.
CREATE TABLE game_state (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT NOT NULL DEFAULT '{}',
  epoch      INTEGER NOT NULL DEFAULT 1,
  rev        INTEGER NOT NULL DEFAULT 0,
  played     INTEGER NOT NULL DEFAULT 0,
  tick_at    INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL DEFAULT 0,
  last_load  TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE game_saves (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  name         TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  play_seconds INTEGER NOT NULL DEFAULT 0,
  summary      TEXT NOT NULL DEFAULT '{}',
  data         TEXT NOT NULL,
  bytes        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX game_saves_user ON game_saves (user_id, kind, created_at);
ALTER TABLE bond ADD COLUMN set_at INTEGER;
ALTER TABLE bond ADD COLUMN set_from INTEGER;
ALTER TABLE bond ADD COLUMN set_why TEXT;
INSERT INTO schema_version(v) VALUES (35);
