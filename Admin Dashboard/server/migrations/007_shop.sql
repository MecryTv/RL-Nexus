-- Der Shop: bezahlter Zugang zum Bot-Dashboard.
-- Spec: docs/superpowers/specs/2026-10-12-shop-design.md
--
-- Geld in Cent als Ganzzahl. Geschrieben wird nur vom Admin-Server. Der Bot
-- liest shop_settings (Bezahlschranke) und shop_grants (wer Zugang hat).
-- Jede TIMESTAMP-Spalte bekommt ihren Standard ausdrücklich: Ohne würde
-- MariaDB der ersten ein ON UPDATE CURRENT_TIMESTAMP anhängen.

CREATE TABLE IF NOT EXISTS shop_settings (
    id            TINYINT UNSIGNED  NOT NULL,
    shop_open     TINYINT(1)        NOT NULL DEFAULT 0,
    -- Der Schalter für den Livegang. Aus: Das Bot-Dashboard ist offen wie bisher.
    paywall       TINYINT(1)        NOT NULL DEFAULT 0,
    trial_enabled TINYINT(1)        NOT NULL DEFAULT 1,
    trial_days    SMALLINT UNSIGNED NOT NULL DEFAULT 7,
    trial_role_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    promo_codes   TINYINT(1)        NOT NULL DEFAULT 0,
    terms_version CHAR(10) CHARACTER SET ascii NOT NULL DEFAULT '2026-10-12',
    updated_by    VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    updated_at    TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

INSERT IGNORE INTO shop_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS shop_products (
    id                INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    title             VARCHAR(40)       NOT NULL,
    description       VARCHAR(160)      NOT NULL DEFAULT '',
    -- Eine Zeile je Stichpunkt.
    bullets           TEXT              NOT NULL,
    kind              ENUM('subscription', 'one_time') NOT NULL,
    -- Nur bei one_time: Tage, NULL heißt unbegrenzt. Abos laufen monatlich.
    duration_days     SMALLINT UNSIGNED NULL DEFAULT NULL,
    price_cents       INT UNSIGNED      NOT NULL,
    badge             VARCHAR(20)       NOT NULL DEFAULT '',
    role_id           VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    visible           TINYINT(1)        NOT NULL DEFAULT 1,
    sort              SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    stripe_product_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    stripe_price_id   VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    created_at        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_customers (
    user_id            VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name               VARCHAR(64)  NULL DEFAULT NULL,
    email              VARCHAR(190) NULL DEFAULT NULL,
    stripe_customer_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    -- Discord-Tokens, versiegelt (seal). Nur bis zum Beitritt auf den Server.
    oauth_sealed       TEXT         NULL DEFAULT NULL,
    oauth_until        TIMESTAMP    NULL DEFAULT NULL,
    joined_at          TIMESTAMP    NULL DEFAULT NULL,
    banned_at          TIMESTAMP    NULL DEFAULT NULL,
    banned_by          VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    ban_reason         VARCHAR(190) NULL DEFAULT NULL,
    created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at      TIMESTAMP    NULL DEFAULT NULL,
    PRIMARY KEY (user_id),
    KEY idx_stripe_customer (stripe_customer_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_orders (
    id                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
    -- RLN-2026-0042, gesetzt direkt nach dem Anlegen aus der id.
    order_no                VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    user_id                 VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    product_id              INT UNSIGNED NULL DEFAULT NULL,
    amount_cents            INT UNSIGNED NOT NULL,
    status                  ENUM('open', 'paid', 'refunded', 'failed') NOT NULL DEFAULT 'open',
    stripe_checkout_id      VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    stripe_invoice_id       VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    -- Die Häkchen vor dem Kauf, mit Zeitpunkt. Der Textstand steht in terms_version.
    consent_terms           TIMESTAMP NULL DEFAULT NULL,
    consent_immediate_start TIMESTAMP NULL DEFAULT NULL,
    consent_adult           TIMESTAMP NULL DEFAULT NULL,
    terms_version           CHAR(10) CHARACTER SET ascii NOT NULL,
    refunded_cents          INT UNSIGNED NOT NULL DEFAULT 0,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at                 TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_order_no (order_no),
    UNIQUE KEY uq_checkout (stripe_checkout_id),
    KEY idx_user (user_id),
    KEY idx_product (product_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_grants (
    id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id                VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    source                 ENUM('trial', 'one_time', 'subscription', 'gift') NOT NULL,
    product_id             INT UNSIGNED NULL DEFAULT NULL,
    starts_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- NULL heißt unbegrenzt.
    ends_at                TIMESTAMP NULL DEFAULT NULL,
    -- Vorzeitig beendet (Sperre, Erstattung, Kauf während des Tests).
    ended_at               TIMESTAMP NULL DEFAULT NULL,
    role_id                VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    role_removed_at        TIMESTAMP NULL DEFAULT NULL,
    stripe_subscription_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    cancel_at_period_end   TINYINT(1) NOT NULL DEFAULT 0,
    order_id               INT UNSIGNED NULL DEFAULT NULL,
    granted_by             VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_subscription (stripe_subscription_id),
    KEY idx_user (user_id),
    KEY idx_product (product_id),
    KEY idx_ends (ends_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_events (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id         VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    kind            VARCHAR(32) CHARACTER SET ascii NOT NULL,
    detail          VARCHAR(500) NULL DEFAULT NULL,
    -- Discord-ID eines Admins, NULL bei allem, was von selbst passiert.
    actor           VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    -- Damit ein Webhook von Stripe höchstens einmal verarbeitet wird.
    stripe_event_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_stripe_event (stripe_event_id),
    KEY idx_user (user_id, id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
