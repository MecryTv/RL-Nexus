-- W-0091: Auswahlmenüs unter eigenen Nachrichten (Custom Message), je Nachricht bis zu drei.
-- Ältere Zeilen bleiben null und lesen sich als keine Menüs.

ALTER TABLE custom_messages ADD COLUMN IF NOT EXISTS menus JSON NULL AFTER buttons;
