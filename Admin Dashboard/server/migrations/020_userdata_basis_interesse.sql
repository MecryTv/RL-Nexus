-- W-0057: „Berechtigtes Interesse“ als Grundlage, für den Bereich Sicherheit (eine Sperre bleibt, damit sie wirkt).
ALTER TABLE userdata_rules MODIFY basis ENUM('pflicht', 'ansprueche', 'interesse') NULL;
