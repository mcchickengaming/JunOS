-- What Anon's hands have been up to: headpats, hand-holds, hugs and
-- the rest, from her desktop app and her main window. lib/touch.php
-- turns these into words for her live context ("so many headpats
-- today"), notices habits, and writes notable days into her memory.
-- touch_day: one row per day (his local day) per kind. n = how many
-- times, ms = how long altogether, the four dayparts for habits.
-- touch_total: all-time count per kind, and the last milestone she
-- was told about.
-- touch_state: bookkeeping (which day was noted, the small daily mood
-- nudge, a milestone waiting for her next reply, the once-a-day
-- "he hasn't touched me today" line).
CREATE TABLE touch_day (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day       TEXT NOT NULL,
  kind      TEXT NOT NULL,
  n         INTEGER NOT NULL DEFAULT 0,
  ms        INTEGER NOT NULL DEFAULT 0,
  morning   INTEGER NOT NULL DEFAULT 0,
  afternoon INTEGER NOT NULL DEFAULT 0,
  evening   INTEGER NOT NULL DEFAULT 0,
  night     INTEGER NOT NULL DEFAULT 0,
  last_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, day, kind)
);
CREATE TABLE touch_total (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL,
  n         INTEGER NOT NULL DEFAULT 0,
  ms        INTEGER NOT NULL DEFAULT 0,
  milestone INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, kind)
);
CREATE TABLE touch_state (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  noted_day   TEXT NOT NULL DEFAULT '',
  mood_day    TEXT NOT NULL DEFAULT '',
  mood_ms     INTEGER NOT NULL DEFAULT 0,
  mood_aff    INTEGER NOT NULL DEFAULT 0,
  mood_ten    INTEGER NOT NULL DEFAULT 0,
  missed_day  TEXT NOT NULL DEFAULT '',
  moment      TEXT NOT NULL DEFAULT '',
  updated_at  INTEGER NOT NULL
);
INSERT INTO schema_version(v) VALUES (29);
