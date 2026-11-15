-- W-0104: Abmelden im Bot-Dashboard gilt auch für kopierte Cookies. Die Sitzung
-- steckt versiegelt im Cookie; hier steht ihre id, bis das Cookie von selbst
-- abliefe (expires_at in ms wie in 046). Abgelaufene Zeilen räumt jede Abmeldung weg.
CREATE TABLE IF NOT EXISTS dashboard_revoked_sessions (
    id         VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    expires_at BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY idx_expires (expires_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
