-- Plan 37: Level System, Etappe 2. Siehe docs/Levels.md.
--
-- level_log: jede Änderung von Hand (Dashboard, /level punkte) mit Grund -
-- wer, bei wem, wie viel, vorher und nachher. mode 'add' ist geben und
-- abziehen (amount mit Vorzeichen). Nach 180 Tagen gelöscht (ActivityPrune).
CREATE TABLE IF NOT EXISTS level_log (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    guild_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id    VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    actor_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    mode       ENUM('add', 'set', 'reset') NOT NULL,
    amount     BIGINT NOT NULL DEFAULT 0,
    before_xp  BIGINT UNSIGNED NOT NULL DEFAULT 0,
    after_xp   BIGINT UNSIGNED NOT NULL DEFAULT 0,
    reason     VARCHAR(200) NOT NULL DEFAULT '',
    created_at BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY idx_level_log_guild (guild_id, created_at),
    KEY idx_level_log_created (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- level_top: der letzte Post „Aktivste der Woche“ bzw. „des Monats“ je
-- Server. period_key ist der Beginn des geposteten Zeitraums - wer ihn zuerst
-- einträgt, postet, so kommt kein Zeitraum doppelt. holders haben die Rolle
-- (bis zu drei IDs, mit Komma), error sagt dem Dashboard, was schiefging.
CREATE TABLE IF NOT EXISTS level_top (
    guild_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    kind       ENUM('week', 'month') NOT NULL,
    period_key VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    holders    VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
    error      VARCHAR(200) NULL,
    posted_at  BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (guild_id, kind)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
