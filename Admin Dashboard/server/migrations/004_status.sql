-- Status: jede Prüfung und eigene Meldungen für status.nexus-emb.de und Discord.
--
-- status_checks bekommt alle zwei Minuten vier Zeilen, eine je Dienst. Nach
-- 90 Tagen löscht das Aufräumen sie (cleanup.ts). Ausgewertet wird nach
-- Zeit, daher der Index vorn auf checked_at.

CREATE TABLE IF NOT EXISTS status_checks (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    checked_at TIMESTAMP       NOT NULL,
    service    ENUM('bot', 'dashboard', 'website', 'database') NOT NULL,
    state      ENUM('ok', 'warn', 'down') NOT NULL,
    -- Millisekunden, NULL ohne Antwort.
    latency_ms INT UNSIGNED    NULL,
    PRIMARY KEY (id),
    KEY idx_checked (checked_at, service),
    KEY idx_down (state, checked_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Eine Störung oder eine geplante Wartung, von Hand im Admin Dashboard.
CREATE TABLE IF NOT EXISTS status_incidents (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    kind        ENUM('stoerung', 'wartung') NOT NULL,
    title       VARCHAR(120) NOT NULL,
    -- Kommagetrennt, etwa "bot,dashboard". Nur Werte aus STATUS_SERVICES.
    services    VARCHAR(64)  NOT NULL,
    state       ENUM('geplant', 'untersucht', 'erkannt', 'beobachtet', 'geloest') NOT NULL,
    starts_at   TIMESTAMP    NULL,
    ends_at     TIMESTAMP    NULL,
    created_by  VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP    NULL,
    PRIMARY KEY (id),
    KEY idx_open (resolved_at, created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Was es Neues gibt. Die erste Zeile ist der Text beim Anlegen.
CREATE TABLE IF NOT EXISTS status_incident_updates (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    incident_id INT UNSIGNED NOT NULL,
    state       ENUM('geplant', 'untersucht', 'erkannt', 'beobachtet', 'geloest') NOT NULL,
    body        TEXT         NOT NULL,
    by_name     VARCHAR(100) NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_incident (incident_id, created_at),
    CONSTRAINT fk_status_update FOREIGN KEY (incident_id) REFERENCES status_incidents (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
