-- Ein Team haengt nicht an einem Kanal: es hat entweder eine ganze Kategorie
-- oder einzelne Text- und Sprachkanaele. Siehe docs/Teams.md.
--
-- channels: { categoryId, textIds: [], voiceIds: [] }
-- Die alte Spalte channel_id bleibt stehen, damit nichts verlorengeht - beim
-- Lesen wandert ihr Inhalt in textIds, geschrieben wird nur noch channels.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS channels JSON NULL AFTER channel_id;
