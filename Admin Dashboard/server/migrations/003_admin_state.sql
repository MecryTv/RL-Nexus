-- Kleinkram, den das Admin Dashboard über Neustarts hinweg behalten muss.
--
-- Bisher genau eines: die ID der Statusmeldung in Discord. Ohne sie würde
-- nach jedem Neustart eine neue Nachricht im Kanal stehen statt die alte
-- aktualisiert.

CREATE TABLE IF NOT EXISTS admin_state (
    name       VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    value      VARCHAR(190) NOT NULL,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
