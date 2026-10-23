-- Looking for: Spieler suchen ein Team, Teams suchen Spieler. Gefragt wird in
-- der DM, der fertige Beitrag steht im Forum. Siehe docs/LookingFor.md.
--
-- Die Fragen, die Nachrichten und die Foren stehen in module_settings ('lft') -
-- hier steht nur, was jemand tatsaechlich abgeschickt hat.
--
-- answers: [{ id, label, value }] - die Frage steht mit dabei, damit ein
-- Beitrag lesbar bleibt, wenn spaeter jemand die Frage aendert.
CREATE TABLE IF NOT EXISTS lft_requests (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    guild_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    kind       ENUM('player', 'team') NOT NULL,
    user_id    VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_name  VARCHAR(100) NOT NULL,
    title      VARCHAR(120) NOT NULL,
    answers    JSON NOT NULL,
    thread_id  VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    message_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    notice_id  VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    status     ENUM('open', 'closed') NOT NULL DEFAULT 'open',
    created_at BIGINT UNSIGNED NOT NULL,
    closed_at  BIGINT UNSIGNED NULL,
    closed_by  VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    PRIMARY KEY (id),
    KEY idx_lft_guild (guild_id, kind, status),
    KEY idx_lft_user (guild_id, user_id, kind, status),
    KEY idx_lft_open (status, created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
