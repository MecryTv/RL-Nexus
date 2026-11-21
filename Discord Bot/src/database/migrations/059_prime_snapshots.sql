-- W-0150: Der letzte vollständige Stand aus Prime, je Discord-Nutzer mit
-- verknüpftem Epic-Konto. Fällt Prime aus, zeigt /rank daraus die Karte mit
-- Hinweis - auch nach einem Neustart, wenn der Arbeitsspeicher leer ist.
--
-- Eigene Tabelle statt player_ranks und player_profiles: die schreibt der Bot nur
-- beim Verknüpfen, und Extra-Modi, Turnier-Rang und Club fehlen dort. Hier steht
-- das ganze Profil als JSON, bei jeder frischen Antwort überschrieben.
--
-- Nur verknüpfte Konten, nie bloß nachgeschlagene Namen (Datenschutz).
CREATE TABLE IF NOT EXISTS prime_snapshots (
    user_id      VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    account_id   VARCHAR(64)  NOT NULL,
    -- Der Anzeigename zur Zeit der Abfrage. /rank search sucht darüber, die
    -- Collation macht Groß- und Kleinschreibung egal.
    display_name VARCHAR(100) NOT NULL,
    profile      JSON         NOT NULL,
    fetched_at   TIMESTAMP    NOT NULL,
    PRIMARY KEY (user_id),
    KEY idx_snapshot_account (account_id),
    KEY idx_snapshot_name (display_name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
