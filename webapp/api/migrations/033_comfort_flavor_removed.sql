-- The parent / adult daughter flavor was removed (owner, Nov 12). Anyone who
-- picked it moves to the closest one that stays wholesome: best friends
-- (platonic, Flirty and 18+ locked off).
UPDATE comfort SET flavor = 'platonic' WHERE flavor = 'parent_daughter';
INSERT INTO schema_version(v) VALUES (33);
