-- W-0101: Self Roles an eine vorhandene Nachricht hängen, dazu Reaktionen als
-- dritte Art neben Knöpfen und Menü. Siehe docs/SelfRoles.md.
--
-- attached:  0 = eigene Nachricht wie bisher, 1 = hängt an einer, die es schon gibt
-- target_id: diese vorhandene Nachricht (im Kanal channel_id). message_id steht
--            nur drin, solange das Panel wirklich dranhängt - nach dem Lösen ist
--            sie leer, target_id bleibt.
-- Alte Panels bleiben, wie sie sind: eigene Nachricht, Knöpfe oder Menü.
ALTER TABLE self_role_panels MODIFY kind ENUM('buttons', 'select', 'reactions') NOT NULL DEFAULT 'buttons';
ALTER TABLE self_role_panels ADD COLUMN IF NOT EXISTS attached TINYINT(1) NOT NULL DEFAULT 0 AFTER message_id;
ALTER TABLE self_role_panels ADD COLUMN IF NOT EXISTS target_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER attached;
