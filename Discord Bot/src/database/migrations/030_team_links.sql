-- RL Team-Uebersicht: Links auf die Ligen und Turniere eines Teams.
-- links: [{ label, url }] - hoechstens fuenf, nur https. Siehe docs/Teams.md.
-- Die Rolle "Analyst" gibt es nicht mehr; wer sie im Kader hat, wird beim Lesen
-- zum Coach (models/Team.ts), dafuer braucht es keine Spalte.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS links JSON NULL AFTER channels;
