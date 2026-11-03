-- Ein Server pro Person (W-0064). Wer den Bot auf welchen Server eingeladen hat,
-- Anfragen und Freigaben (Signatur F-<id>), die Wahl beim Start der Regel und
-- Server, auf die der Bot nicht zurück soll.

-- Eine Zeile je Server, der letzte Stand. Hauptserver: aktiv und ohne Freigabe.
CREATE TABLE IF NOT EXISTS server_invites (
    guild_id    VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    guild_name  VARCHAR(100) NOT NULL,
    guild_icon  VARCHAR(64)  CHARACTER SET ascii COLLATE ascii_bin NULL,
    user_id     VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    source      ENUM('audit', 'owner') NOT NULL,
    owner_id    VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    invited_at  TIMESTAMP(3) NOT NULL,
    members     INT UNSIGNED NOT NULL DEFAULT 0,
    state       ENUM('active', 'left') NOT NULL DEFAULT 'active',
    left_at     TIMESTAMP(3) NULL,
    left_reason VARCHAR(20)  NULL,
    approval_id INT UNSIGNED NULL,
    -- Schon vor dem Start der Regel da: Darüber entscheidet die Wahl, nicht der Beitritt.
    legacy      TINYINT(1)   NOT NULL DEFAULT 0,
    updated_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (guild_id),
    KEY idx_user_state (user_id, state)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Anfragen aus den DMs und Entscheidungen des Teams. Je Person und Server nur eine offene.
CREATE TABLE IF NOT EXISTS server_requests (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id      VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    guild_id     VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    guild_name   VARCHAR(100) NOT NULL,
    kind         ENUM('extra', 'switch') NOT NULL,
    reason       VARCHAR(300) NOT NULL DEFAULT '',
    origin       ENUM('dm', 'wahl', 'team') NOT NULL,
    status       ENUM('open', 'approved', 'declined', 'revoked', 'done') NOT NULL DEFAULT 'open',
    created_at   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    decided_by   VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NULL,
    decided_name VARCHAR(100) NULL,
    decided_role VARCHAR(20)  NULL,
    decided_at   TIMESTAMP(3) NULL,
    open_key     VARCHAR(41)  CHARACTER SET ascii COLLATE ascii_bin AS (IF(status = 'open', CONCAT(user_id, ':', guild_id), NULL)) PERSISTENT,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_open (open_key),
    KEY idx_status (status),
    KEY idx_user (user_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Die Wahl-DM beim Start der Regel, eine je Person.
CREATE TABLE IF NOT EXISTS server_choices (
    user_id      VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    deadline     TIMESTAMP(3) NOT NULL,
    reminded     TINYINT(1)   NOT NULL DEFAULT 0,
    chosen_guild VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NULL,
    chosen_at    TIMESTAMP(3) NULL,
    state        ENUM('open', 'chosen', 'done', 'timeout') NOT NULL DEFAULT 'open',
    dm_error     VARCHAR(200) NULL,
    created_at   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id),
    KEY idx_state (state)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- „Neues Einladen auf diesen Server sperren“ beim Entfernen. W-0057 übernimmt das später.
CREATE TABLE IF NOT EXISTS server_blocks (
    guild_id   VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    blocked_by VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    by_name    VARCHAR(100) NOT NULL,
    reason     VARCHAR(300) NOT NULL DEFAULT '',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (guild_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
