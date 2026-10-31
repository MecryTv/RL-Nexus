-- Plan 29: Rollen-Listen. Eine Zeile je Liste eines Servers.
--   settings      Rollen, Titel je Person, Text- und Bild-Einstellungen (JSON)
--   message_id    die gesendete Nachricht; NULL: die Liste wurde noch nie gesendet
--   message_kind  Text-Karte oder Bilddatei – ein Wechsel heißt: löschen und neu senden
--   fingerprint   SHA-1 des zuletzt gesendeten Stands – gleich heißt: nichts zu tun
-- Eigene Bild-Vorlagen stehen in module_settings unter "role-lists".
-- Siehe docs/RoleLists.md.
CREATE TABLE IF NOT EXISTS role_lists (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    guild_id     VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name         VARCHAR(40) NOT NULL,
    position     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    channel_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    design       ENUM('compact', 'sections', 'board') NOT NULL DEFAULT 'sections',
    settings     JSON NOT NULL,
    message_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    message_kind ENUM('text', 'image') NULL,
    fingerprint  CHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL,
    created_at   BIGINT UNSIGNED NOT NULL,
    updated_at   BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY idx_role_lists_guild (guild_id, position)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
