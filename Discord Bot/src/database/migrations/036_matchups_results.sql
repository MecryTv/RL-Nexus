-- Plan 28: Matchups mit Ergebnis in Discord. Drei Spalten an matchups:
--   live_at             wann die Ankündigung auf „läuft“ umgestellt wurde (genau einmal)
--   result_reminded_at  wann ans fehlende Ergebnis erinnert wurde (genau einmal)
--   result_message_id   die Ergebnis-Nachricht - „Ergebnis ändern“ bearbeitet sie
-- Siehe docs/Matchups.md.
ALTER TABLE matchups
    ADD COLUMN IF NOT EXISTS live_at BIGINT UNSIGNED NULL AFTER reminded_at,
    ADD COLUMN IF NOT EXISTS result_reminded_at BIGINT UNSIGNED NULL AFTER live_at,
    ADD COLUMN IF NOT EXISTS result_message_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER result_reminded_at;

-- Was schon angepfiffen ist, gilt als erledigt: Der erste Lauf soll keine alten
-- Ankündigungen umstellen und nicht an längst vergangene Spiele erinnern.
UPDATE matchups
SET live_at = COALESCE(live_at, CAST(UNIX_TIMESTAMP(NOW(3)) * 1000 AS UNSIGNED)),
    result_reminded_at = COALESCE(result_reminded_at, CAST(UNIX_TIMESTAMP(NOW(3)) * 1000 AS UNSIGNED))
WHERE at < CAST(UNIX_TIMESTAMP(NOW(3)) * 1000 AS UNSIGNED);
