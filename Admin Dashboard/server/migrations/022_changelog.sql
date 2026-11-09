-- Changelog im Admin Dashboard (W-0061): je Version ein Eintrag mit seinen
-- Änderungen. posted_*: der Post in Discord, posted_hash der Fingerabdruck
-- des geposteten Inhalts (weicht er ab, ist der Post veraltet).
CREATE TABLE IF NOT EXISTS changelog_versions (
    id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
    version           VARCHAR(12)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    title             VARCHAR(80)  NOT NULL,
    released_on       DATE         NOT NULL,
    created_by        VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_name      VARCHAR(100) NOT NULL,
    created_at        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    posted_channel_id VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NULL,
    posted_message_id VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NULL,
    posted_at         TIMESTAMP(3) NULL,
    posted_hash       CHAR(64)     CHARACTER SET ascii COLLATE ascii_bin NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_version (version)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Die Änderungen einer Version, in ihrer Reihenfolge. Gehen mit der Version.
CREATE TABLE IF NOT EXISTS changelog_items (
    id         INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    version_id INT UNSIGNED      NOT NULL,
    position   SMALLINT UNSIGNED NOT NULL,
    kind       ENUM('neu', 'verbessert', 'behoben', 'intern') NOT NULL,
    area       ENUM('bot', 'dashboard', 'admin', 'webseite') NOT NULL,
    text       VARCHAR(200)      NOT NULL,
    task       CHAR(6)           CHARACTER SET ascii COLLATE ascii_bin NULL,
    PRIMARY KEY (id),
    KEY idx_version (version_id, position),
    CONSTRAINT fk_changelog_items_version FOREIGN KEY (version_id) REFERENCES changelog_versions (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
