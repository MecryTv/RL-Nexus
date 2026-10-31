-- Plan 30: eigener Hintergrund je Team fuer die gezeichnete Team-Karte.
-- Galerie-Pfad wie logo; NULL: der Hintergrund fuer alle Teams gilt.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS background VARCHAR(500) NULL AFTER logo;
