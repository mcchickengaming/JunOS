-- The progression service (foundations #31 item 8, lib/progress.php): skills, xp, levels and
-- Mastery for her AND the player, Credits, item ids, keepsakes, buffs, story grants, things he
-- set going and the running session, as one JSON blob per user (the engine owns its shape:
-- progress_blank()). Never holds anything about the bond: the relationship is not a skill.
CREATE TABLE progress (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO schema_version(v) VALUES (34);
