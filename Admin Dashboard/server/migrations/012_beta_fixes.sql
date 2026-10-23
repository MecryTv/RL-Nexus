-- Plan 22, nach dem Abschluss-Review.
-- Wem der Beta-Zugang entzogen wurde, der kommt mit demselben Code nicht
-- zurück; ein Code mit mehreren Nutzungen brächte ihn sonst gleich wieder herein.
CREATE TABLE IF NOT EXISTS beta_removals (
    user_id    VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    code_id    INT UNSIGNED NOT NULL,
    removed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id, code_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Wie alle Tabellen des Admin Dashboards: InnoDB und utf8mb4, damit Emojis in
-- der Notiz nicht zu „?“ werden. Codes und IDs bleiben ascii.
ALTER TABLE beta_codes
    ENGINE = InnoDB,
    DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci,
    MODIFY COLUMN note VARCHAR(190) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;

ALTER TABLE beta_members
    ENGINE = InnoDB,
    DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
