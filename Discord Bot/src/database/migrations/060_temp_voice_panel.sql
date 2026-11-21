-- W-0151: Das Panel im Chat eines Temp-Kanals ist jetzt ein Bild mit dem Stand
-- des Kanals. Der Bot setzt es bei jeder Änderung neu und muss dafür wissen,
-- welche Nachricht es ist. NULL: noch nicht bekannt (Panels von vor W-0151 trägt
-- der Bot beim ersten Klick nach) oder kein Panel (Support-Hub, festes Panel).

ALTER TABLE temp_voices
    ADD COLUMN IF NOT EXISTS panel_message_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL;
