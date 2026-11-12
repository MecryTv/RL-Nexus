-- Rocket Roulette (W-0087): Abende und ihre Runden. Einstellungen stehen in
-- module_settings ('rocket-roulette'). Beendete Abende löscht der Bot nach
-- 30 Tagen samt Runden. Siehe docs/superpowers/specs/2026-11-11-rocket-roulette-design.md.

-- Ein Abend. sit_out: wer in der letzten Runde aussetzte; wishes: Paare;
-- history: wie oft zwei im selben Team waren; participants: wer wie oft dabei
-- war (für die Übersicht). announce/control: Kanal und Nachricht.
CREATE TABLE IF NOT EXISTS roulette_evenings (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    guild_id     VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status       ENUM('planned', 'running', 'ended') NOT NULL DEFAULT 'planned',
    starts_at    BIGINT UNSIGNED NOT NULL,
    created_by   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at   BIGINT UNSIGNED NOT NULL,
    ended_at     BIGINT UNSIGNED NULL,
    announce     JSON NULL,
    control      JSON NULL,
    round        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    sit_out      JSON NOT NULL,
    wishes       JSON NOT NULL,
    history      JSON NOT NULL,
    participants JSON NOT NULL,
    PRIMARY KEY (id),
    KEY idx_roulette_guild (guild_id, status),
    KEY idx_roulette_due (status, starts_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Eine Runde mit ihren Lobbys (Teams, Host, Name, Passwort, Kanäle, Karten).
CREATE TABLE IF NOT EXISTS roulette_rounds (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    evening_id INT UNSIGNED NOT NULL,
    guild_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    number     SMALLINT UNSIGNED NOT NULL,
    status     ENUM('drawing', 'running', 'ended', 'aborted') NOT NULL DEFAULT 'drawing',
    created_at BIGINT UNSIGNED NOT NULL,
    ended_at   BIGINT UNSIGNED NULL,
    lobbies    JSON NOT NULL,
    PRIMARY KEY (id),
    KEY idx_roulette_rounds (evening_id, number)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
