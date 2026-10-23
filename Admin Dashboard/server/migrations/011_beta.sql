-- Plan 22: Beta Access. Ein dritter Modus neben Free und Paid Access: ins
-- Bot-Dashboard kommt nur, wer einen Beta-Code eingelöst hat. Der Bot liest
-- access_mode und beta_members, er schreibt nichts hinein.
ALTER TABLE shop_settings
    MODIFY COLUMN access_mode ENUM('free', 'paid', 'beta') NOT NULL DEFAULT 'free';

-- Codes zum Einlösen, erzeugt im Admin Dashboard (Bot → Beta Access).
CREATE TABLE IF NOT EXISTS beta_codes (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    code       VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    max_uses   INT UNSIGNED NOT NULL DEFAULT 1,
    uses       INT UNSIGNED NOT NULL DEFAULT 0,
    note       VARCHAR(190) NULL DEFAULT NULL,
    created_by VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    revoked_at TIMESTAMP(3) NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_beta_code (code)
);

-- Wer einen Code eingelöst hat. Entziehen löscht die Zeile, das Protokoll behält es.
CREATE TABLE IF NOT EXISTS beta_members (
    user_id     VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    code_id     INT UNSIGNED NULL DEFAULT NULL,
    redeemed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id),
    KEY idx_beta_members_code (code_id)
);
