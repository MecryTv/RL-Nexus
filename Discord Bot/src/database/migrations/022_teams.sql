-- RL Team-Uebersicht: die Gruppen, unter denen die Teams stehen.
-- Main, Academy, Div 2 ... Siehe docs/Teams.md.
CREATE TABLE IF NOT EXISTS team_groups (
    id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    guild_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name     VARCHAR(60) NOT NULL,
    position INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_team_group_guild (guild_id, position)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
