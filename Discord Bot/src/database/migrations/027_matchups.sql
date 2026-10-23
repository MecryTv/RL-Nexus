-- Matchups: anstehende Partien eines Teams. Eingetragen wird ueber einen
-- oeffentlichen Link, gemeldet wird im Kanal. Siehe docs/Matchups.md.
--
-- Kanal, Erinnerung und die Nachrichten stehen in module_settings ('matchups') -
-- hier stehen nur die Partien selbst.
--
-- team_name steht mit dabei: verschwindet das Team aus der Uebersicht, bleibt
-- die Partie lesbar.
CREATE TABLE IF NOT EXISTS matchups (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    guild_id     VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    team_id      INT UNSIGNED NULL,
    team_name    VARCHAR(80) NOT NULL,
    opponent     VARCHAR(80) NOT NULL,
    league       VARCHAR(60) NOT NULL DEFAULT '',
    mode         ENUM('1v1', '2v2', '3v3', '4v4') NOT NULL DEFAULT '3v3',
    best_of      TINYINT UNSIGNED NOT NULL DEFAULT 0,
    at           BIGINT UNSIGNED NOT NULL,
    stream       VARCHAR(512) NULL,
    note         TEXT NULL,
    status       ENUM('planned', 'played', 'cancelled') NOT NULL DEFAULT 'planned',
    score        JSON NULL,
    message_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    reminded_at  BIGINT UNSIGNED NULL,
    created_by   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_name VARCHAR(100) NOT NULL,
    created_at   BIGINT UNSIGNED NOT NULL,
    updated_at   BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY idx_matchup_guild (guild_id, status, at),
    KEY idx_matchup_team (team_id, at),
    -- Der Lauf, der erinnert, sucht genau hierueber.
    KEY idx_matchup_due (status, at, reminded_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
