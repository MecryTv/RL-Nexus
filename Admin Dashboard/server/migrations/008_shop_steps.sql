-- Wie weit das Freischalten nach einer Zahlung ist. Die Preisseite fragt das
-- jede Sekunde ab und setzt danach ihre Haken. NULL: noch nicht dran.
-- Dazu die Zahlung bei Stripe, damit eine Erstattung ihre Bestellung findet.
ALTER TABLE shop_orders
    ADD COLUMN IF NOT EXISTS joined_step ENUM('done', 'warn') NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS role_step ENUM('done', 'warn') NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS mail_step ENUM('done', 'warn') NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    ADD KEY IF NOT EXISTS idx_payment_intent (stripe_payment_intent_id);
