-- Plan 31: Anti Villain. Fünf Tabellen, alle je Server.
--   av_cases      ein Fall je Festhalten oder Meldung: Punkte, Gründe, Verlauf,
--                 gemerkte Rollen, gelöschte Nachrichten (JSON)
--   av_trust      „War kein Hack“: bis wann jemand als vertraut gilt
--   av_reports    „Hack melden“: wer wen wann gemeldet hat
--   av_incidents  Raid und Nuke: Stand und aufgehobene gelöschte Objekte (JSON)
--   av_events     das Protokoll, 30 Tage
-- Einstellungen stehen in module_settings unter "anti-villain".
-- Siehe docs/AntiVillain.md.
CREATE TABLE IF NOT EXISTS av_cases (
    id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
    guild_id          VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id           VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status            ENUM('open', 'released', 'trusted', 'banned', 'kicked') NOT NULL DEFAULT 'open',
    score             SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    hits              JSON NOT NULL,
    timeline          JSON NOT NULL,
    saved_roles       JSON NOT NULL,
    partial_roles     JSON NOT NULL,
    deleted           JSON NOT NULL,
    team_message_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    person_message_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    incident_id       INT UNSIGNED NULL,
    created_at        BIGINT UNSIGNED NOT NULL,
    closed_at         BIGINT UNSIGNED NULL,
    closed_by         VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    PRIMARY KEY (id),
    KEY idx_av_cases_guild (guild_id, status),
    KEY idx_av_cases_user (guild_id, user_id, status)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS av_trust (
    guild_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id  VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    until    BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (guild_id, user_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS av_reports (
    guild_id    VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    target_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    reporter_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    at          BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (guild_id, target_id, reporter_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS av_incidents (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    guild_id    VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    kind        ENUM('raid', 'nuke') NOT NULL,
    state       JSON NOT NULL,
    message_id  VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    started_at  BIGINT UNSIGNED NOT NULL,
    ended_at    BIGINT UNSIGNED NULL,
    PRIMARY KEY (id),
    KEY idx_av_incidents_guild (guild_id, kind, ended_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS av_events (
    id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    guild_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    at       BIGINT UNSIGNED NOT NULL,
    kind     VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    title    VARCHAR(200) NOT NULL,
    detail   VARCHAR(400) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    KEY idx_av_events_guild (guild_id, at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
