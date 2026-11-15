-- W-0104: Beim Abmelden widerrufene Sitzungen, damit eine vorher kopierte Kopie des Cookies nicht mehr gilt.
-- session_key: Discord-ID und Ablauf der Sitzung (`id:exp`), das Cookie trägt keine eigene ID.
-- expires_at: Ablauf in Sekunden wie im Cookie. Danach gilt die Sitzung ohnehin nicht mehr, cleanup.ts räumt die Zeile weg.
CREATE TABLE IF NOT EXISTS admin_revoked_sessions (
    session_key VARCHAR(48)     CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    expires_at  BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (session_key),
    KEY idx_expires (expires_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
