-- Gelöschte Personen auch aus den Server-Backups nehmen (W-0051, Review).
-- Ist die Backup-Datenbank beim Löschen nicht bereit, holt die Uhr das nach.
ALTER TABLE userdata_deletions ADD COLUMN IF NOT EXISTS backup_pending TINYINT(1) NOT NULL DEFAULT 0 AFTER forget_pending;
