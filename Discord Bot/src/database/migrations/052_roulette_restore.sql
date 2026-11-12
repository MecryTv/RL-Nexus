-- W-0087, Review I5: Was vor der Auslosung galt (Aussetzer der letzten Runde,
-- verbrauchte Einmal-Wünsche). Bricht ein Moderator die Runde ab, kommt das zurück:
-- die Runde zählt nicht, wer zuletzt aussetzen musste, ist weiter zuerst dran.
ALTER TABLE roulette_rounds
    ADD COLUMN IF NOT EXISTS restore JSON NULL AFTER lobbies;
