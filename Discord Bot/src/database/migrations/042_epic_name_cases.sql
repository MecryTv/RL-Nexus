-- Plan 33: Epic-Name geändert. Ein Fall je Person und altem Namen: Der Bot fand
-- den Namen nicht mehr und konnte den neuen nicht selbst holen, also fragt er per
-- DM. Hier steht, wann die DM ging, ob sie ankam, wann der Captain Bescheid bekam
-- und wann es erledigt war - damit nach einem Neustart nichts doppelt kommt.
-- Siehe docs/Teams.md.
CREATE TABLE IF NOT EXISTS epic_name_cases (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id     VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    old_name    VARCHAR(100) NOT NULL,
    old_key     VARCHAR(100) NOT NULL,
    account_id  VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    last_seen   JSON NOT NULL,
    detected_at BIGINT UNSIGNED NOT NULL,
    dm_at       BIGINT UNSIGNED NULL,
    dm_failed   TINYINT(1) NOT NULL DEFAULT 0,
    channel_id  VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    message_id  VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    captain_at  BIGINT UNSIGNED NULL,
    resolved_at BIGINT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_epic_name_case (user_id, old_key),
    KEY idx_epic_name_open (resolved_at, captain_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
