-- W-0133: Modul-Einstellungen je Server und der Verlauf aller Änderungen.
-- bot_module_settings.config (029) hält zusätzlich values und askable.

-- Abweichungen eines Servers vom Wert für alle. NULL heißt: wie alle.
-- config: {"linkMode"?: ..., "values": {<key>: number}}.
CREATE TABLE IF NOT EXISTS bot_module_overrides (
    module      VARCHAR(40)  NOT NULL,
    guild_id    VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status      ENUM('on','off') NULL,
    notice      VARCHAR(300) NULL,
    config      JSON NULL,
    note        VARCHAR(300) NULL,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by  VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NULL,
    PRIMARY KEY (module, guild_id),
    KEY idx_bot_module_overrides_guild (guild_id)
);

-- Jede Änderung mit dem ganzen Stand vorher und nachher, für Verlauf und
-- Zurücknehmen. guild_id NULL: der Wert für alle.
CREATE TABLE IF NOT EXISTS bot_module_changes (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    module       VARCHAR(40)  NOT NULL,
    guild_id     VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NULL,
    before_state JSON NULL,
    after_state  JSON NULL,
    kinds        VARCHAR(40)  NOT NULL DEFAULT '',
    summary      VARCHAR(500) NOT NULL DEFAULT '',
    note         VARCHAR(300) NULL,
    user_id      VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_name    VARCHAR(64)  NOT NULL,
    bot_ok       TINYINT(1)   NULL,
    undo_of      INT UNSIGNED NULL,
    created_at   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_bot_module_changes_scope (module, guild_id, id)
);
