-- the android quirk: now and then, past a thousand of one touch, she
-- says the exact running count out loud (lib/touch.php
-- touch_count_line). count_at = when she last did, so it stays rare.
ALTER TABLE touch_state ADD COLUMN count_at INTEGER NOT NULL DEFAULT 0;
INSERT INTO schema_version(v) VALUES (30);
