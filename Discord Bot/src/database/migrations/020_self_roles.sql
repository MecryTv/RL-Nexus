-- Self Roles: Panels, aus denen sich Mitglieder ihre Rollen selbst holen -
-- als Knopfreihe oder als Auswahlmenue. Siehe docs/SelfRoles.md.

-- Ein Panel ist eine Nachricht in einem Kanal. message_id steht drin, sobald
-- sie gesendet wurde - dann laesst sie sich auch nachtraeglich aendern.
--
-- mode: "multi"  jede Rolle einzeln an und aus
--       "single" genau eine aus diesem Panel, die neue ersetzt die alte
-- max_roles: 0 heisst ohne Grenze (nur bei "multi" sinnvoll)
-- require_role: ohne diese Rolle geht gar nichts
-- body: Kopf der Nachricht wie bei Custom Message (kind/content/embed/doc)
-- roles: [{ roleId, label, description, emoji, style, locked }]
CREATE TABLE IF NOT EXISTS self_role_panels (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    guild_id     VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name         VARCHAR(80) NOT NULL,
    kind         ENUM('buttons', 'select') NOT NULL DEFAULT 'buttons',
    mode         ENUM('multi', 'single') NOT NULL DEFAULT 'multi',
    max_roles    TINYINT UNSIGNED NOT NULL DEFAULT 0,
    require_role VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    body         JSON NOT NULL,
    roles        JSON NOT NULL,
    channel_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    message_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    created_by   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at   BIGINT UNSIGNED NOT NULL,
    updated_at   BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY idx_selfrole_guild (guild_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
