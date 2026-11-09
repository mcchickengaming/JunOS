-- Things Jun picks up from Anon over time (lib/quirks.php): little
-- habits she catches from what they do together, or because he asked.
-- The first is anime tsundere talk ("b-baka"), caught from watching
-- and talking about anime with him. One row per quirk: points earned
-- (capped per day), how many days they came on, where it stands
-- (learning / picked = she caught it / asked = he asked her / stopped
-- = he asked her to drop it), when, and whether her prompt has had
-- the one-time "this is new" line yet.
CREATE TABLE quirks (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quirk      TEXT NOT NULL,
  points     INTEGER NOT NULL DEFAULT 0,
  days       INTEGER NOT NULL DEFAULT 0,
  last_day   TEXT NOT NULL DEFAULT '',
  day_points INTEGER NOT NULL DEFAULT 0,
  state      TEXT NOT NULL DEFAULT 'learning',
  since      INTEGER NOT NULL DEFAULT 0,
  announced  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, quirk)
);
INSERT INTO schema_version(v) VALUES (31);
