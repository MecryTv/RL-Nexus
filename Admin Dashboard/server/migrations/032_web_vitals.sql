-- W-0141: echte Ladezeiten von Webseite und Bot-Dashboard (web-vitals).
-- Nur Summen je Stunde (UTC), Dienst, Gerät, Messwert und Stufe: Anzahl und
-- Summe der Werte. Kein Pfad, keine IP, kein User-Agent. Aufbewahrung 90 Tage.
-- Millisekunden, CLS mal 1000. Die Stufen stehen in server/vitals.ts.
CREATE TABLE IF NOT EXISTS web_vitals_hours (
    hour     DATETIME NOT NULL,
    service  ENUM('website','dashboard') NOT NULL,
    device   ENUM('mobile','desktop') NOT NULL,
    metric   ENUM('LCP','INP','CLS','TTFB') NOT NULL,
    bin      TINYINT UNSIGNED NOT NULL,
    samples  INT UNSIGNED NOT NULL DEFAULT 0,
    total    BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (hour, service, device, metric, bin)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
