-- Plan 34, Abschluss-Review: Der Nachtrag merkt sich, bei welcher Person er
-- war. Bricht er ab (Neustart, Absturz), setzt der nächste Prozess dahinter
-- fort - niemand bekommt etwas doppelt. Siehe docs/Levels.md.
ALTER TABLE level_backfill ADD COLUMN IF NOT EXISTS last_user VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER xp;
