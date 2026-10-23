-- Plan 20: Free Access und Paid Access. Ein Modus statt der zwei Schalter
-- „Shop geöffnet“ und „Bezahlschranke“. Er setzt shop_open und paywall mit,
-- die der Bot weiter liest.
ALTER TABLE shop_settings
    ADD COLUMN IF NOT EXISTS access_mode ENUM('free', 'paid') NOT NULL DEFAULT 'free',
    ADD COLUMN IF NOT EXISTS mode_changed_at TIMESTAMP NULL DEFAULT NULL;

-- Beim ersten Start gilt, was heute schon wirkt: Bezahlschranke an heißt paid.
-- Ohne Stripe-Aufruf und ohne Mail, laufende Abos gibt es auf dem Live-Server
-- nicht (Betreiber, 23.10.2026).
UPDATE shop_settings SET access_mode = IF(paywall = 1, 'paid', 'free') WHERE id = 1;
UPDATE shop_settings SET shop_open = IF(access_mode = 'paid', 1, 0), paywall = IF(access_mode = 'paid', 1, 0) WHERE id = 1;

-- Eingefroren während Free Access: seit wann, bei Abos die Resttage in
-- Sekunden und ob Stripe die Pause angenommen hat (0: nachholen).
ALTER TABLE shop_grants
    ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMP(3) NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS frozen_rest INT UNSIGNED NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS stripe_paused TINYINT(1) NULL DEFAULT NULL;
