-- RL Team-Uebersicht: was der Bot fuer ein Team selbst angelegt hat - Rolle,
-- Kategorie, Text- und Sprachkanaele. Nur das bietet das Loeschen eines Teams
-- zum Mitloeschen an. created: { roleId, categoryId, textIds, voiceIds }.
-- Die Rollen je Aufgabe stehen in module_settings, dafuer braucht es keine Spalte.
-- Siehe docs/Teams.md.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS created JSON NULL AFTER links;
