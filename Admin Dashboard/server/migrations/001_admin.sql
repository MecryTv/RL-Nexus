-- Die eigenen Tabellen des Admin Dashboards. Die Tabellen des Bots
-- (dashboard_groups, notifications) legt der Bot selbst an.

CREATE TABLE IF NOT EXISTS contact_messages (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    topic      ENUM('frage', 'bug', 'modulwunsch', 'partnerschaft', 'datenschutz', 'sonstiges') NOT NULL,
    name       VARCHAR(80)   NOT NULL,
    email      VARCHAR(190)  NULL,
    discord    VARCHAR(64)   NULL,
    subject    VARCHAR(120)  NOT NULL,
    message    TEXT          NOT NULL,
    context    VARCHAR(1000) NULL,
    status     ENUM('neu', 'erledigt') NOT NULL DEFAULT 'neu',
    handled_by VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    handled_at TIMESTAMP     NULL,
    created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_contact_status (status, created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_audit (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_name  VARCHAR(64)  NOT NULL,
    action     VARCHAR(64)  NOT NULL,
    target     VARCHAR(190) NULL,
    detail     VARCHAR(500) NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_created (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
