-- Das Postfach: Mailcow-Postfächer, mit denen das Admin Dashboard liest und schreibt.
--
-- Gespeichert wird nur, wie man hineinkommt. Die Mails selbst bleiben in
-- Mailcow, das Dashboard holt sie bei Bedarf über IMAP.

CREATE TABLE IF NOT EXISTS mail_accounts (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    -- Zugleich der Benutzername bei IMAP und SMTP.
    address    VARCHAR(254) NOT NULL,
    -- Steht im Kopf der Vorlage, etwa „Support“.
    label      VARCHAR(40)  NOT NULL,
    -- Das App-Passwort, verschlüsselt mit MAIL_KEY (server/mail/secret.ts).
    secret     TEXT         NOT NULL,
    position   INT UNSIGNED NOT NULL DEFAULT 0,
    created_by VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_mail_address (address)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Aus welchem Postfach eine Antwort auf das Kontaktformular ging. NULL bei
-- älteren Antworten und bei „Anderswo beantwortet“.
ALTER TABLE contact_replies
    ADD COLUMN account VARCHAR(254) NULL AFTER way;
