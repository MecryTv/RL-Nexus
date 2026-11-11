-- W-0071: Fälle werden nicht mehr gelöscht, sondern für Moderatoren ausgeblendet.
-- Wer den Server verwaltet, sieht sie weiter (Reiter „Ausgeblendet“) und kann sie
-- wieder einblenden. hidden_at NULL: sichtbar. hidden_by und hidden_name nennen,
-- wer ausgeblendet hat, hidden_reason warum (Pflicht).
ALTER TABLE mod_cases
    ADD COLUMN IF NOT EXISTS hidden_at     BIGINT UNSIGNED NULL AFTER log_message,
    ADD COLUMN IF NOT EXISTS hidden_by     VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER hidden_at,
    ADD COLUMN IF NOT EXISTS hidden_name   VARCHAR(100) NULL AFTER hidden_by,
    ADD COLUMN IF NOT EXISTS hidden_reason VARCHAR(500) NULL AFTER hidden_name;
