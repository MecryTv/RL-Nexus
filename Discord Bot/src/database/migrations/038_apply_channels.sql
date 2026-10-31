-- Plan 30: eigener Kanal je Bewerbung. channel_id ist der Kanal, den der Bot
-- fuer diese Bewerbung angelegt hat; NULL: die Karte liegt im Sammelkanal.
ALTER TABLE apply_submissions ADD COLUMN IF NOT EXISTS channel_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER message_id;
