-- W-0095: Abmeldungen im Modul RL Team-Übersicht. Eine Zeile je Spieler, Team
-- und Zeitraum. Tage als 'JJJJ-MM-TT' in deutscher Zeit (CHAR statt DATE: kein
-- Treiber verschiebt sie über die Zeitzone), „bis“ zählt mit. Eigene Tabelle,
-- weil der Kader als JSON in teams.players steht und jedes Speichern im
-- Dashboard ihn neu schreibt. Siehe docs/Teams.md.
CREATE TABLE IF NOT EXISTS team_absences (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    guild_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    team_id    INT UNSIGNED NOT NULL,
    user_id    VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    starts_on  CHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    ends_on    CHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    reason     VARCHAR(40) NOT NULL DEFAULT '',
    note       VARCHAR(200) NOT NULL DEFAULT '',
    created_at BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY idx_absence_team (team_id, ends_on),
    KEY idx_absence_user (guild_id, user_id),
    CONSTRAINT fk_absence_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Das Panel „Verfügbarkeit“ im Kanal des Teams: wo es steht, damit es bearbeitet statt neu gepostet wird.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS absence_channel_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS absence_message_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL;
