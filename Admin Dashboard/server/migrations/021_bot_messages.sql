-- Nachrichten über den Bot (W-0058, Spec Teil 3): Vorlagen, verschickte
-- Nachrichten und wer sie bekam. content ist JSON wie IMessageContent in
-- shared/messages.ts, ohne eingesetzte Platzhalter.

-- Vorlagen. audience ist nur ein Hinweis in der Liste, keine Sperre.
CREATE TABLE IF NOT EXISTS bot_message_templates (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name         VARCHAR(60)  NOT NULL,
    audience     ENUM('all', 'one') NOT NULL DEFAULT 'all',
    content      JSON         NOT NULL,
    updated_by   VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    updated_name VARCHAR(100) NOT NULL,
    updated_at   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uniq_name (name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Eine Nachricht: an alle (Uhr alle 2 s) oder an eine Person (target_user_id).
-- template_name ist der Name der Vorlage zur Zeit des Versands.
-- total, sent, failed, skipped zählt der Server aus bot_message_recipients nach.
CREATE TABLE IF NOT EXISTS bot_messages (
    id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    template_name  VARCHAR(60)  NOT NULL DEFAULT '',
    content        JSON         NOT NULL,
    audience       ENUM('all', 'one') NOT NULL,
    target_user_id VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NULL,
    state          ENUM('running', 'paused', 'done', 'cancelled') NOT NULL DEFAULT 'running',
    pause_reason   VARCHAR(200) NULL,
    total          INT UNSIGNED NOT NULL DEFAULT 0,
    sent           INT UNSIGNED NOT NULL DEFAULT 0,
    failed         INT UNSIGNED NOT NULL DEFAULT 0,
    skipped        INT UNSIGNED NOT NULL DEFAULT 0,
    created_by     VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_name   VARCHAR(100) NOT NULL,
    created_at     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    finished_at    TIMESTAMP(3) NULL,
    PRIMARY KEY (id),
    KEY idx_state (state),
    KEY idx_target (target_user_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Wer eine Nachricht bekommt. Der Schlüssel hält jede Person je Nachricht
-- genau einmal. sending: gerade an Discord unterwegs; steht eine Zeile beim
-- Start noch so da, wird sie failed und nie neu geschickt.
CREATE TABLE IF NOT EXISTS bot_message_recipients (
    message_id INT UNSIGNED NOT NULL,
    user_id    VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    state      ENUM('open', 'sending', 'sent', 'failed', 'skipped') NOT NULL DEFAULT 'open',
    reason     VARCHAR(200) NULL,
    done_at    TIMESTAMP(3) NULL,
    PRIMARY KEY (message_id, user_id),
    KEY idx_message_state (message_id, state),
    KEY idx_user (user_id),
    CONSTRAINT fk_bot_message_recipient FOREIGN KEY (message_id) REFERENCES bot_messages (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Die sechs Vorlagen aus dem Entwurf R1 (N-A). Nur für Änderungen an dem, was
-- die Leute schon nutzen, Wartung, Störungen, Datenschutz und Hinweise an eine
-- Person; keine Werbung (§ 7 UWG).
INSERT IGNORE INTO bot_message_templates (name, audience, content, updated_by, updated_name) VALUES
    ('Änderung bei RL Nexus', 'all', '{"color": "blau", "stamp": "ÄNDERUNG", "title": "Änderung bei RL Nexus", "intro": "Hallo {name}, das ändert sich bei RL Nexus.", "big": null, "boxes": [{"label": "Was sich ändert", "text": "Hier steht, was sich ändert und ab wann."}], "buttons": [{"label": "Mehr dazu", "url": "https://nexus-emb.de/module"}], "signed": false}', '0', 'RL Nexus'),
    ('Wartung', 'all', '{"color": "gold", "stamp": "WARTUNG", "title": "Geplante Wartung", "intro": "Hallo {name}, in dieser Zeit ist RL Nexus kurz nicht erreichbar.", "big": {"text": "Sa., 8. Nov. · 02:00–03:00 Uhr", "note": "Bot, Dashboard und Webseite sind bis zu einer Stunde nicht erreichbar."}, "boxes": [], "buttons": [{"label": "Status", "url": "https://status.nexus-emb.de"}], "signed": false}', '0', 'RL Nexus'),
    ('Störung behoben', 'all', '{"color": "gruen", "stamp": "BEHOBEN", "title": "Alles läuft wieder", "intro": "Hallo {name}, die Störung ist behoben.", "big": null, "boxes": [{"label": "Was war los", "text": "Hier steht, was nicht ging und seit wann es wieder läuft."}], "buttons": [{"label": "Status", "url": "https://status.nexus-emb.de"}], "signed": false}', '0', 'RL Nexus'),
    ('Datenschutz-Hinweis', 'all', '{"color": "lila", "stamp": "DATENSCHUTZ", "title": "Unsere Datenschutzerklärung hat sich geändert", "intro": "Hallo {name}, du hast Daten bei RL Nexus, deshalb sagen wir es dir.", "big": null, "boxes": [{"label": "Was sich ändert", "text": "Hier steht, was neu ist."}, {"label": "Gilt ab", "text": "Tag eintragen"}], "buttons": [{"label": "Datenschutzerklärung", "url": "https://nexus-emb.de/datenschutz"}, {"label": "Fragen dazu", "url": "https://nexus-emb.de/kontakt"}], "signed": false}', '0', 'RL Nexus'),
    ('Hinweis zu deinem Konto', 'one', '{"color": "rot", "stamp": "HINWEIS", "title": "Ein Hinweis zu deinem Konto", "intro": "Hallo {name}, das betrifft nur dich.", "big": null, "boxes": [{"label": "Worum es geht", "text": "Hier steht der Hinweis."}], "buttons": [{"label": "Kontakt", "url": "https://nexus-emb.de/kontakt"}], "signed": false}', '0', 'RL Nexus'),
    ('Persönliche Nachricht', 'one', '{"color": "grau", "stamp": "VOM TEAM", "title": "Nachricht vom Team", "intro": "Hallo {name},", "big": null, "boxes": [{"label": "", "text": "Hier steht deine Nachricht."}], "buttons": [{"label": "Kontakt", "url": "https://nexus-emb.de/kontakt"}], "signed": true}', '0', 'RL Nexus');
