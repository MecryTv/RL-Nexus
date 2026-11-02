-- Was bleibt (W-0051, Runde 3): je aufbewahrtem Bereich die Rechtsgrundlage,
-- eine Norm dazu und wie viele Jahre. Steht im Beleg der Löschung.
ALTER TABLE userdata_rules
    ADD COLUMN IF NOT EXISTS basis ENUM('pflicht', 'ansprueche') NULL AFTER note,
    ADD COLUMN IF NOT EXISTS law   VARCHAR(60) NULL AFTER basis,
    ADD COLUMN IF NOT EXISTS years TINYINT UNSIGNED NULL AFTER law;
