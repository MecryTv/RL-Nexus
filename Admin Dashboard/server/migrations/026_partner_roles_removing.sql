-- W-0062: Eine Rolle, die nach einer Aktion weg soll, das Wegnehmen aber scheiterte.
-- Der Zeitgeber holt es nach (Review-Fund 5).

ALTER TABLE partner_roles MODIFY state ENUM('given', 'pending', 'missing', 'removing') NOT NULL;
