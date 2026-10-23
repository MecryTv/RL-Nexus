-- Antworten auf Kontaktnachrichten, direkt aus dem Admin Dashboard.
--
-- Eigene Tabelle statt Spalten: Auf eine Nachricht kann mehrfach geantwortet
-- werden, und was einmal rausging, soll stehen bleiben.

CREATE TABLE IF NOT EXISTS contact_replies (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    message_id INT UNSIGNED NOT NULL,
    user_id    VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_name  VARCHAR(64) NOT NULL,
    body       TEXT        NOT NULL,
    -- Wie die Antwort hinausging. 'webmail' heißt: im Dashboard nur vermerkt,
    -- geschrieben wurde sie woanders.
    way        ENUM('mail', 'webmail') NOT NULL DEFAULT 'mail',
    created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_reply_message (message_id, created_at),
    -- Wird die Nachricht gelöscht, gehen ihre Antworten mit.
    CONSTRAINT fk_reply_message FOREIGN KEY (message_id) REFERENCES contact_messages (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Der dritte Stand: Es ging etwas raus, erledigt ist die Sache aber noch nicht.
ALTER TABLE contact_messages
    MODIFY COLUMN status ENUM('neu', 'beantwortet', 'erledigt') NOT NULL DEFAULT 'neu';
