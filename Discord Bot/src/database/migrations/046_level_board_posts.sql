-- Plan 43 (W-0043): die Rangliste als feste Nachricht in einem Kanal, je
-- Server eine. Siehe docs/Levels.md.
--
-- Getrennt von den Einstellungen, damit Speichern im Dashboard die
-- Nachricht-ID nicht überschreibt. fingerprint ist, was zuletzt gezeichnet
-- wurde: ist er gleich, bleibt die Nachricht stehen. error sagt dem
-- Dashboard, was schiefging (keine Rechte, Kanal weg).
CREATE TABLE IF NOT EXISTS level_board_posts (
    guild_id    VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    channel_id  VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    message_id  VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    fingerprint VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
    error       VARCHAR(200) NULL,
    updated_at  BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (guild_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
