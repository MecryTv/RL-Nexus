-- W-0138: Aktivität von Webseite, Statusseite und Bot-Dashboard aus dem
-- nginx-Protokoll. Nur Summen je Stunde (UTC, beim Lesen nach Europe/Berlin);
-- keine IP, kein User-Agent, kein Pfad. Aufbewahrung 13 Monate.

-- Aufrufe: Seitenanfragen mit 200/304, ohne Bots.
CREATE TABLE IF NOT EXISTS activity_views (
    hour     DATETIME NOT NULL,
    service  ENUM('website','dashboard','status') NOT NULL,
    device   ENUM('mobile','desktop','tablet') NOT NULL,
    source   ENUM('discord','direct','google','topgg','other') NOT NULL,
    views    INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (hour, service, device, source)
);

-- Alle Anfragen je Statusklasse, ohne Bots, Scanner und Zeiten mit Wartung.
CREATE TABLE IF NOT EXISTS activity_status (
    hour          DATETIME NOT NULL,
    service       ENUM('website','dashboard','status') NOT NULL,
    status_class  ENUM('2xx','3xx','4xx','5xx') NOT NULL,
    requests      INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (hour, service, status_class)
);

-- Wo der Leser steht: `live` für das eigene Protokoll, `import` für das
-- einmalige Nachlesen der ersten 14 Tage.
CREATE TABLE IF NOT EXISTS activity_reader (
    name           VARCHAR(40) NOT NULL,
    inode          VARCHAR(40) NULL,
    read_offset    BIGINT UNSIGNED NOT NULL DEFAULT 0,
    first_line_at  DATETIME NULL,
    imported_at    DATETIME NULL,
    PRIMARY KEY (name)
);
