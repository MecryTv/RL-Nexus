-- Plan 23: Der Wartungsschalter steht in der Datenbank statt als Datei in
-- data/flags. Webseite und Bot lesen ihn hier, je Bereich eine Zeile.
-- Läuft heißt: active = 1 und nicht (auto_end = 1 und ends_at vorbei).
CREATE TABLE IF NOT EXISTS site_maintenance (
    area       ENUM('website', 'dashboard') NOT NULL PRIMARY KEY,
    active     TINYINT(1) NOT NULL DEFAULT 0,
    reason     VARCHAR(200) NULL DEFAULT NULL,
    started_at TIMESTAMP(3) NULL DEFAULT NULL,
    -- Name im Admin Dashboard. Erscheint nie öffentlich.
    started_by VARCHAR(100) NULL DEFAULT NULL,
    ends_at    TIMESTAMP(3) NULL DEFAULT NULL,
    auto_end   TINYINT(1) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

INSERT IGNORE INTO site_maintenance (area) VALUES ('website'), ('dashboard');
