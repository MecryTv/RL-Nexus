-- W-0089: Wechsel auf ein Abo oder eine längere Laufzeit, die Restzeit des alten Zugangs wird Rabatt.
-- switch_max_percent: Höchstrabatt in Prozent vom neuen Preis. switch_mode: replace (der alte endet mit der Zahlung)
-- oder append (der neue beginnt am Ende des alten). discount_cents: der Rabatt aus der Restzeit.

ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS switch_max_percent TINYINT UNSIGNED NOT NULL DEFAULT 50 AFTER promo_codes;

ALTER TABLE shop_orders
    ADD COLUMN IF NOT EXISTS switch_mode ENUM('replace', 'append') NULL AFTER amount_cents,
    ADD COLUMN IF NOT EXISTS discount_cents INT UNSIGNED NOT NULL DEFAULT 0 AFTER switch_mode;
