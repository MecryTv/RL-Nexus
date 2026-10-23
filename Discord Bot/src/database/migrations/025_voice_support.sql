-- Temp Voice: Warteraeume mit Meldung ans Team. Siehe docs/Voice.md.
--
-- support: { channelId, messageId, claimedBy, claimedAt, remindedAt }
-- Steht nur bei Kanaelen eines Support-Hubs. NULL heisst: ein gewoehnlicher
-- Kanal, der sein Panel wie bisher bekommt.
ALTER TABLE temp_voices ADD COLUMN IF NOT EXISTS support JSON NULL AFTER settings;
