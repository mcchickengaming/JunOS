-- Long-term bond with Anon, separate from the mood gauges in
-- `relationship`. The gauges swing turn to turn; bond xp only ever
-- goes up, slowly, from time spent together. lib/bond.php turns xp
-- into one of six stages (Stranger .. Devoted) that set how much of
-- herself Jun shows him.
-- pending_stage: a stage she just reached and hasn't reacted to yet.
-- day / day_xp: the daily cap, so it can't be ground out in one night.
CREATE TABLE bond (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp            INTEGER NOT NULL DEFAULT 0,
  stage         INTEGER NOT NULL DEFAULT 1,
  pending_stage INTEGER,
  day           TEXT NOT NULL DEFAULT '',
  day_xp        INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL
);
INSERT INTO schema_version(v) VALUES (28);
