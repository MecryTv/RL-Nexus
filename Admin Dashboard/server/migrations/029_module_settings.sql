-- W-0131: Modul-Einstellungen für alle Server (Admin → Bot → Module). Das
-- Admin schreibt, der Bot liest. Keine Zeile heißt: an, kein Hinweis,
-- Standardwerte. config hält, was nur ein Modul hat, bei rl-tracking
-- {"linkMode": "login" | "name" | "both"}.
CREATE TABLE IF NOT EXISTS bot_module_settings (
    module      VARCHAR(40)  NOT NULL PRIMARY KEY,
    status      ENUM('on','beta','off') NOT NULL DEFAULT 'on',
    notice      VARCHAR(300) NULL,
    config      JSON NULL,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by  VARCHAR(64) NULL
);
