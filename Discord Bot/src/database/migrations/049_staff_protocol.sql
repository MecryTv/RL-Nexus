-- W-0049: eigener Punkt „Protokoll“ im Server-Dashboard. Siehe docs/Dashboard.md.
--
-- staff_grant_log bekommt die Art des Eintrags (change: geändert, view:
-- angesehen, private: privater Bereich, grant: die Freigabe selbst), bei
-- Einstellungen vorher und nachher als JSON (detail) und bei privaten Tickets
-- die Zeit, die es offen war (seconds). Alte Einträge bekommen ihre Art aus
-- Bereich und Text. Die neuen Angaben einer Freigabe stehen in staff_grants.data.
ALTER TABLE staff_grant_log
    ADD COLUMN IF NOT EXISTS kind    VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'change' AFTER at,
    ADD COLUMN IF NOT EXISTS detail  TEXT NULL AFTER text,
    ADD COLUMN IF NOT EXISTS seconds INT UNSIGNED NULL AFTER detail;

UPDATE staff_grant_log SET kind = 'grant' WHERE area = 'Freigabe';
UPDATE staff_grant_log SET kind = 'private' WHERE kind = 'change' AND text LIKE '% geöffnet';
