-- Clips der Woche: Runden, eingereichte Clips und Stimmen. Siehe docs/Clips.md.
-- Die Einstellungen stehen in module_settings unter "clips".

-- Eine Woche: offen zum Einreichen, dann Abstimmung, dann fertig.
-- winners: [{ place, entryId, userId, name, votes, prize, url, kind, messageUrl }]
CREATE TABLE IF NOT EXISTS clip_rounds (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    guild_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status     ENUM('open', 'voting', 'done') NOT NULL DEFAULT 'open',
    opened_at  BIGINT NOT NULL,
    closes_at  BIGINT NOT NULL,
    ends_at    BIGINT NOT NULL,
    closed_at  BIGINT NULL,
    ended_at   BIGINT NULL,
    prizes     JSON NULL,
    winners    JSON NULL,
    PRIMARY KEY (id),
    KEY idx_clip_round_guild (guild_id, status, opened_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Ein Clip: die Nachricht im Kanal, ihr Link und die Karte mit dem Stimm-Knopf.
CREATE TABLE IF NOT EXISTS clip_entries (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    round_id        INT UNSIGNED NOT NULL,
    guild_id        VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id         VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_name       VARCHAR(100) NOT NULL,
    channel_id      VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    message_id      VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    url             VARCHAR(1000) NOT NULL,
    kind            ENUM('video', 'link') NOT NULL,
    vote_message_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    created_at      BIGINT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_clip_message (message_id),
    KEY idx_clip_entry_round (round_id, user_id),
    CONSTRAINT fk_clip_entry_round FOREIGN KEY (round_id) REFERENCES clip_rounds (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Eine Stimme je Person und Runde. Wer umstimmt, ueberschreibt sie.
CREATE TABLE IF NOT EXISTS clip_votes (
    round_id INT UNSIGNED NOT NULL,
    user_id  VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    entry_id INT UNSIGNED NOT NULL,
    voted_at BIGINT NOT NULL,
    PRIMARY KEY (round_id, user_id),
    KEY idx_clip_vote_entry (entry_id),
    CONSTRAINT fk_clip_vote_round FOREIGN KEY (round_id) REFERENCES clip_rounds (id) ON DELETE CASCADE,
    CONSTRAINT fk_clip_vote_entry FOREIGN KEY (entry_id) REFERENCES clip_entries (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
