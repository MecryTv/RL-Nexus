-- Plan 32: Backups für den Discord-Server. Drei Tabellen, alle je Server und
-- Live-Zustand: Sie kommen nie in ein Backup (EXCLUDED_TABLES im Admin Dashboard).
--   server_id_map    welche alte ID nach einem Laden welche neue ist, dauerhaft
--   server_restores  ein Laden als Auftrag: Schritte, Fortschritt, Bericht
--   av_debris        Trümmer des Anti-Nuke (gelöschte Kanäle und Rollen), 7 Tage
-- Siehe docs/Backups.md.
CREATE TABLE IF NOT EXISTS server_id_map (
    guild_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    old_id     VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    new_id     VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    kind       ENUM('role', 'channel', 'emoji', 'sticker') NOT NULL,
    created_at BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (guild_id, old_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS server_restores (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    guild_id        VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    target_guild_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    backup_id       INT UNSIGNED NOT NULL,
    safety_id       INT UNSIGNED NULL,
    mode            ENUM('repair', 'exact', 'other') NOT NULL,
    status          ENUM('running', 'done', 'failed', 'cancelled') NOT NULL DEFAULT 'running',
    phase           ENUM('server', 'bot', 'remap', 'panels', 'done') NOT NULL DEFAULT 'server',
    done            INT UNSIGNED NOT NULL DEFAULT 0,
    state           JSON NOT NULL,
    actor_id        VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    actor_name      VARCHAR(100) NOT NULL,
    channel_id      VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    message_id      VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    started_at      BIGINT UNSIGNED NOT NULL,
    updated_at      BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY idx_server_restores_guild (guild_id, status),
    KEY idx_server_restores_target (target_guild_id, status)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS av_debris (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    guild_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    kind       ENUM('channel', 'role') NOT NULL,
    object_id  VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name       VARCHAR(100) NOT NULL,
    data       JSON NOT NULL,
    members    JSON NOT NULL,
    at         BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY idx_av_debris_guild (guild_id, at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
