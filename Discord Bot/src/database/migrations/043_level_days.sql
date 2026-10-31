-- Plan 34: Level System, Etappe 1. Siehe docs/Levels.md.
--
-- level_days: Punkte, Nachrichten und Voice-Minuten je Server, Person und
-- UTC-Tag (Tage seit 1970, wie member_activity). Daraus rechnen die Zeiträume
-- 7 und 30 Tage und der Platz-Trend. Nach 40 Tagen gelöscht (ActivityPrune).
CREATE TABLE IF NOT EXISTS level_days (
    guild_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id  VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    day      INT UNSIGNED NOT NULL,
    xp       INT UNSIGNED NOT NULL DEFAULT 0,
    messages INT UNSIGNED NOT NULL DEFAULT 0,
    voice    INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, day, user_id),
    KEY idx_level_days_user (guild_id, user_id, day),
    KEY idx_level_days_day (day)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- level_backfill: der einmalige Nachtrag aus der Server-Übersicht. Eine Zeile
-- je Server; wer sie zuerst anlegt, schreibt gut - so gibt es nichts doppelt.
-- cutoff ist D0: nur Tage davor werden nachgetragen.
CREATE TABLE IF NOT EXISTS level_backfill (
    guild_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    mode       ENUM('backfill', 'prefill', 'none') NOT NULL DEFAULT 'none',
    cutoff     INT UNSIGNED NOT NULL DEFAULT 0,
    members    INT UNSIGNED NOT NULL DEFAULT 0,
    xp         BIGINT UNSIGNED NOT NULL DEFAULT 0,
    done_at    BIGINT UNSIGNED NULL,
    claimed_at BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (guild_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
