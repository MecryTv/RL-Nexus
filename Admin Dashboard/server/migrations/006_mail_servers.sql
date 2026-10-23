-- Die Mailserver je Postfach, eingetragen im Admin Dashboard statt in der
-- Umgebung. Leer heißt: der Vorschlag aus der Umgebung oder mail.<Domain>.

ALTER TABLE mail_accounts
    ADD COLUMN imap_host VARCHAR(253) NOT NULL DEFAULT '' AFTER secret,
    ADD COLUMN imap_port SMALLINT UNSIGNED NOT NULL DEFAULT 993 AFTER imap_host,
    ADD COLUMN smtp_host VARCHAR(253) NOT NULL DEFAULT '' AFTER imap_port,
    ADD COLUMN smtp_port SMALLINT UNSIGNED NOT NULL DEFAULT 465 AFTER smtp_host;
