-- W-0131: Kleine Merker des Bots, die einen Neustart überleben müssen.
-- link_mode_applied: die Verknüpfungsart für Epic-Konten, deren Folgen der Bot
-- zuletzt angewandt hat. Wird sie im Admin strenger, während der Bot aus ist,
-- merkt er es beim nächsten Start am Vergleich mit diesem Wert.
CREATE TABLE IF NOT EXISTS bot_state (
    name       VARCHAR(64)  NOT NULL PRIMARY KEY,
    value      VARCHAR(255) NOT NULL,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
