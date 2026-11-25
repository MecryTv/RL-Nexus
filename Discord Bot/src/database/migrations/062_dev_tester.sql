-- W-0154: Dev-Tester, eine Untergruppe von Developer für Testkonten des Teams.
-- Sie verhalten sich wie normale Nutzer (kein Staff, nur eigene Server), kommen
-- aber ohne Code durch den Beta-Modus, ohne Kauf durch die Bezahlschranke und
-- sehen Module auf Beta. Vergeben im Admin Dashboard unter Gruppen.
ALTER TABLE dashboard_groups MODIFY group_name ENUM('administrator', 'partner', 'premium', 'devtester') NOT NULL;
