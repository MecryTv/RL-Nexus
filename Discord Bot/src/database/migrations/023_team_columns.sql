-- Die Tabelle teams gibt es seit 001, sie kann bisher aber nur Name, Kuerzel
-- und Rolle. Was die RL Team-Uebersicht braucht, kommt hier dazu.
--
-- Eigene Datei, nicht in 022: wer 022 in seiner ersten Fassung schon angewendet
-- hat, bekommt sie sonst nie zu sehen - eine Migration laeuft genau einmal.
--
-- players: [{ id, discordId, name, epicName, role, peaks: {1v1,2v2,3v3},
--            snapshot: { name, platform, mmr, tier, tierName, divisionName, at, error } }]
-- Der Peak kommt von Hand, alles andere aus Prime. Der snapshot ist nur der
-- zuletzt geholte Stand, damit die Karte auch steht, wenn Prime schweigt.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS group_id INT UNSIGNED NULL AFTER guild_id;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER tag;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS color VARCHAR(7) NULL AFTER description;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS logo VARCHAR(500) NULL AFTER color;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS channel_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER role_id;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS players JSON NULL AFTER channel_id;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0 AFTER players;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS message_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER position;
ALTER TABLE teams ADD KEY IF NOT EXISTS idx_team_group (group_id);
