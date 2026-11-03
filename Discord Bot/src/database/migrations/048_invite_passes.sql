-- W-0064, Punkt 4: Eingeladen wird nur über das Bot-Dashboard. Der Knopf
-- „Bot einladen“ legt einen Freigabe-Pass für genau diesen Server und diese
-- Person an, 15 Minuten gültig, einmal benutzbar. Kommt der Bot ohne Pass auf
-- einen Server, geht er wieder (Owner bekommt die DM D1). Zeiten in ms wie in 046.
CREATE TABLE IF NOT EXISTS invite_passes (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    guild_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id    VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at BIGINT UNSIGNED NOT NULL,
    expires_at BIGINT UNSIGNED NOT NULL,
    used_at    BIGINT UNSIGNED NULL,
    PRIMARY KEY (id),
    KEY idx_guild (guild_id, used_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
