-- Nach dem Review von Plan 12:
-- pending: Die Kasse ist fertig, das Geld (etwa eine Lastschrift) kommt erst
-- Tage später. Solange geht kein zweiter Kauf.
-- uq_order: Eine Bestellung gibt höchstens einen Zugang, auch wenn das
-- Erfüllen nach einem Abbruch noch einmal läuft. Tests und Geschenke haben
-- keine Bestellung (NULL), davon darf es beliebig viele geben.
-- synced_at: Wann der Shop zuletzt versucht hat, Server und Rolle für diese
-- Bestellung abzugleichen. Der Ablauf-Job versucht Gescheitertes alle 30
-- Minuten erneut.
ALTER TABLE shop_orders
    MODIFY COLUMN status ENUM('open', 'pending', 'paid', 'refunded', 'failed') NOT NULL DEFAULT 'open',
    ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP NULL DEFAULT NULL;

ALTER TABLE shop_grants
    ADD UNIQUE KEY IF NOT EXISTS uq_order (order_id);
