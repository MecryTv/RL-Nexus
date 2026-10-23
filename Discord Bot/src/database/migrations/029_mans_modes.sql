-- 2, 4 & 6 Mans: je Modus eine eigene Warteschlange und eine eigene MMR.
-- Vorher gab es nur 3v3; die vorhandenen Zeilen gehoeren deshalb zu Modus 6.
-- Siehe docs/SixMans.md.
ALTER TABLE sixmans_players ADD COLUMN IF NOT EXISTS mode TINYINT UNSIGNED NOT NULL DEFAULT 6 AFTER guild_id;

-- Die Wertung haengt jetzt am Modus: derselbe Spieler steht dreimal drin.
ALTER TABLE sixmans_players DROP PRIMARY KEY, ADD PRIMARY KEY (guild_id, mode, user_id);

-- Und die Rangliste wird je Modus gelesen.
ALTER TABLE sixmans_players DROP INDEX idx_six_rank, ADD KEY idx_six_rank (guild_id, mode, mmr DESC);

ALTER TABLE sixmans_rounds ADD COLUMN IF NOT EXISTS mode TINYINT UNSIGNED NOT NULL DEFAULT 6 AFTER guild_id;
