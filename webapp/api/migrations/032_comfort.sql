-- Comfort & ratings (foundations #31, the one consent + ratings gate,
-- lib/gate.php + js/core/gate.js). One row per user, his own choices:
-- what they are to each other (flavor: romantic / friends_open /
-- platonic / siblings / parent_daughter) and whether she may bring a
-- change up herself (flavor_lock), the Flirty switch (on by default),
-- 18+ (off by default; only on after he confirms he's 18 or older,
-- adult_confirmed_at), 18+ outside her window, and rated moments for
-- the siblings flavor (its own opt-in). The hard locks (platonic,
-- parent / adult daughter never rated) are in code, not here.
CREATE TABLE comfort (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  flavor             TEXT NOT NULL DEFAULT 'romantic',
  flavor_lock        INTEGER NOT NULL DEFAULT 0,
  flirty             INTEGER NOT NULL DEFAULT 1,
  adult              INTEGER NOT NULL DEFAULT 0,
  adult_confirmed_at INTEGER NOT NULL DEFAULT 0,
  adult_outside      INTEGER NOT NULL DEFAULT 0,
  siblings_rated     INTEGER NOT NULL DEFAULT 0,
  updated_at         INTEGER NOT NULL DEFAULT 0
);
INSERT INTO schema_version(v) VALUES (32);
