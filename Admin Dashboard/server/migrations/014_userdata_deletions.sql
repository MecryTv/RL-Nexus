-- Geplante und erledigte Löschungen von Nutzerdaten (W-0051, Teil 3b). Die
-- Zeile bleibt nach dem Löschen als Nachweis: ID, Zeiten, Zahlen je Bereich.
-- open_user ist nur bei offenen Löschungen gesetzt; der eindeutige Schlüssel
-- darauf lässt je Person nur eine offene zu, auch bei zwei Klicks zugleich.
CREATE TABLE IF NOT EXISTS userdata_deletions (
    id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id        VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_name      VARCHAR(100) NULL,
    state          ENUM('geplant', 'angehalten', 'abgebrochen', 'geloescht') NOT NULL DEFAULT 'geplant',
    due_at         TIMESTAMP(3) NOT NULL,
    reason         VARCHAR(200) NOT NULL,
    planned_by     VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    planned_name   VARCHAR(100) NOT NULL,
    dm_state       ENUM('offen', 'zugestellt', 'nicht_zustellbar') NOT NULL DEFAULT 'offen',
    dm_error       VARCHAR(200) NULL,
    dm_channel_id  VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NULL,
    dm_message_id  VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NULL,
    copy_at        TIMESTAMP(3) NULL,
    stopped_at     TIMESTAMP(3) NULL,
    cancelled_by   VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NULL,
    cancelled_at   TIMESTAMP(3) NULL,
    done_at        TIMESTAMP(3) NULL,
    -- Der Bot war beim Ausführen nicht erreichbar: das Vergessen holt die Uhr nach.
    forget_pending TINYINT(1)   NOT NULL DEFAULT 0,
    result         JSON NULL,
    created_at     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    open_user      VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin AS (IF(state IN ('geplant', 'angehalten'), user_id, NULL)) PERSISTENT,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_open_user (open_user),
    KEY idx_state_due (state, due_at),
    KEY idx_user (user_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
