-- RL 6Mans: Warteschlange fuer 3v3-Pickup-Games. Jeder Server hat seine eigene
-- MMR; ab Werk faengt jeder bei 600 an. Siehe docs/SixMans.md.
--
-- Kanal, Kategorie und die Nachrichten stehen in module_settings ('rl-6mans').
-- Die Warteschlange selbst steht nirgends: sie lebt im Bot und ist nach einem
-- Neustart leer - das Panel sagt das dann auch.

-- Die Wertung je Server und Spieler.
CREATE TABLE IF NOT EXISTS sixmans_players (
    guild_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id    VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name       VARCHAR(100) NOT NULL,
    mmr        SMALLINT UNSIGNED NOT NULL DEFAULT 600,
    wins       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    losses     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    games      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    streak     SMALLINT NOT NULL DEFAULT 0,
    updated_at BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (guild_id, user_id),
    KEY idx_six_rank (guild_id, mmr DESC)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Eine Runde. blue/orange sind die User-IDs, names und before halten fest, wie
-- es beim Start aussah - daraus entsteht die Veraenderung.
CREATE TABLE IF NOT EXISTS sixmans_rounds (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    guild_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    blue       JSON NOT NULL,
    orange     JSON NOT NULL,
    names      JSON NOT NULL,
    before_mmr JSON NOT NULL,
    status     ENUM('running', 'done', 'cancelled') NOT NULL DEFAULT 'running',
    winner     TINYINT UNSIGNED NOT NULL DEFAULT 0,
    lobby_name VARCHAR(32) NOT NULL,
    lobby_pass VARCHAR(32) NOT NULL,
    channels   JSON NULL,
    channel_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    message_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    reports    JSON NULL,
    change_mmr SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at BIGINT UNSIGNED NOT NULL,
    ended_at   BIGINT UNSIGNED NULL,
    PRIMARY KEY (id),
    KEY idx_six_round_guild (guild_id, status, id),
    -- Der Sweep sucht genau hierueber.
    KEY idx_six_round_open (status, created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
