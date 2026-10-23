-- Clips der Woche, zweite Fassung: abgestimmt wird per Reaktion unter dem Clip,
-- jeder Clip wird beim Einreichen gesichert (clips/<server>/<datum>_runde-<id>/),
-- am Ende stehen Stimmen und Platz an jedem Clip. Siehe docs/Clips.md.
-- Die Karte mit dem Stimm-Knopf gibt es nicht mehr, ihre Spalte geht.
ALTER TABLE clip_entries ADD COLUMN IF NOT EXISTS votes INT UNSIGNED NULL AFTER created_at;
ALTER TABLE clip_entries ADD COLUMN IF NOT EXISTS ranking INT UNSIGNED NULL AFTER votes;
ALTER TABLE clip_entries ADD COLUMN IF NOT EXISTS file VARCHAR(40) NULL AFTER ranking;
ALTER TABLE clip_entries ADD COLUMN IF NOT EXISTS size INT UNSIGNED NULL AFTER file;
ALTER TABLE clip_entries DROP COLUMN IF EXISTS vote_message_id;
