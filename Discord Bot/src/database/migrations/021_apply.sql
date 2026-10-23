-- Apply System: Bewerbungen ueber einen oeffentlichen Link, geprueft im
-- Dashboard und in Discord. Siehe docs/Apply.md.

-- Ein Formular: wofuer man sich bewirbt und welche Fragen dazugehoeren.
-- questions: [{ id, label, hint, kind: 'short'|'long'|'choice', choices[], required, max }]
-- settings:  { channelId, acceptRole, pingRoles[], dm, cooldownDays, minAccountDays, requireRole }
CREATE TABLE IF NOT EXISTS apply_forms (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    guild_id    VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name        VARCHAR(80) NOT NULL,
    description TEXT NULL,
    emoji       VARCHAR(64) NULL,
    open        TINYINT(1) NOT NULL DEFAULT 1,
    questions   JSON NOT NULL,
    settings    JSON NOT NULL,
    created_by  VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at  BIGINT UNSIGNED NOT NULL,
    updated_at  BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY idx_apply_form_guild (guild_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Eine abgeschickte Bewerbung. answers: [{ id, value }] - die Frage-ID zeigt
-- auf questions im Formular, der Text bleibt so stehen, wie er abgeschickt
-- wurde. Aendert jemand spaeter die Frage, bleibt die Antwort lesbar.
CREATE TABLE IF NOT EXISTS apply_submissions (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    form_id      INT UNSIGNED NOT NULL,
    guild_id     VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id      VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_name    VARCHAR(100) NOT NULL,
    answers      JSON NOT NULL,
    status       ENUM('open', 'accepted', 'declined') NOT NULL DEFAULT 'open',
    note         TEXT NULL,
    decided_by   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    decided_name VARCHAR(100) NULL,
    decided_at   BIGINT UNSIGNED NULL,
    message_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    created_at   BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY idx_apply_sub_guild (guild_id, status),
    KEY idx_apply_sub_user (guild_id, user_id),
    KEY idx_apply_sub_form (form_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
