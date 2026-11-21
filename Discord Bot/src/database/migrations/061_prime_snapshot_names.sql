-- W-0152: /rank search sucht den letzten Stand auch über den Anzeigenamen.
-- utf8mb4_unicode_ci machte dabei Akzente egal: „Rene“ fand „René“, also einen
-- anderen Spieler. Jetzt vergleicht die Spalte genau, und PrimeSnapshots.Lookup
-- macht nur Groß- und Kleinschreibung egal (LOWER auf beiden Seiten).
ALTER TABLE prime_snapshots
    MODIFY display_name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
