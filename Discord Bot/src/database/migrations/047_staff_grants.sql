-- Plan 44 (W-0011): Staff-Freigabe für fremde Server. Siehe docs/Dashboard.md.
--
-- staff_grants: eine Anfrage von Staff und nach dem Ja die Freigabe selbst.
-- Gesucht wird über die Spalten, der Rest (Gefragte, Dauer, private Bereiche,
-- DMs) steht als JSON in data. staff_grant_log: was Staff mit der Freigabe
-- geändert und in privaten Bereichen angesehen hat, 180 Tage lang
-- (ActivityPrune). Zeiten in ms wie in 046.
CREATE TABLE IF NOT EXISTS staff_grants (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    guild_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    staff_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status     VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at BIGINT UNSIGNED NOT NULL,
    ended_at   BIGINT UNSIGNED NULL,
    data       LONGTEXT NOT NULL,
    PRIMARY KEY (id),
    KEY staff_grants_guild (guild_id, created_at),
    KEY staff_grants_status (status)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_grant_log (
    id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    grant_id BIGINT UNSIGNED NOT NULL,
    guild_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    at       BIGINT UNSIGNED NOT NULL,
    area     VARCHAR(80) NOT NULL,
    text     VARCHAR(300) NOT NULL,
    PRIMARY KEY (id),
    KEY staff_grant_log_guild (guild_id, at),
    KEY staff_grant_log_grant (grant_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
