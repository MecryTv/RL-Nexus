-- Moderation: der Support-Warteraum. Eine Zeile je Person, die gerade im
-- Warteraum sitzt - sie verschwindet, sobald sie ihn verlaesst. Der Warteraum
-- selbst steht in mod_settings.config.support. Siehe docs/Moderation.md.
--
-- Vorher hing ein Warteraum an einem Temp-Voice-Hub (025_voice_support.sql):
-- je Wartendem ein eigener Kanal. Die Spalte temp_voices.support bleibt und
-- sagt seither nur noch, dass ein Kanal aus einem Support-Hub kommt.
CREATE TABLE IF NOT EXISTS support_waits (
    guild_id    VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id     VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    channel_id  VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    notify_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    message_id  VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    claimed_by  VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    since       BIGINT NOT NULL,
    reminded_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
