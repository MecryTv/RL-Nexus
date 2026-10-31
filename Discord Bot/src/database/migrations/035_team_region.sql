-- Plan 26: Region eines Teams fuer die gezeichnete Team-Karte, etwa "EU".
ALTER TABLE teams ADD COLUMN IF NOT EXISTS region VARCHAR(16) NULL AFTER tag;
