-- Dauerhafte Sperre mit VPN-Erkennung (W-0057, Spec Teil 4). IPs stehen nie im
-- Klartext hier, nur HMAC-Hashes von IP und Netz (server/security/hash.ts).

-- Eine Sperre je Person, aufgehobene bleiben für die Vorgeschichte.
-- scope: Bausteine durch Komma (shared/security.ts BLOCKS).
CREATE TABLE IF NOT EXISTS security_bans (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id      VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_name    VARCHAR(100) NULL,
    scope        VARCHAR(64)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    reasons      VARCHAR(200) NOT NULL DEFAULT '',
    note         TEXT         NULL,
    state        ENUM('active', 'lifted') NOT NULL DEFAULT 'active',
    linked_to    INT UNSIGNED NULL,
    created_by   VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_name VARCHAR(100) NOT NULL,
    created_at   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    changed_at   TIMESTAMP(3) NULL,
    lifted_at    TIMESTAMP(3) NULL,
    open_user    VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin AS (IF(state = 'active', user_id, NULL)) PERSISTENT,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_active (open_user),
    KEY idx_user (user_id),
    KEY idx_state (state)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Jede Änderung mit vorher und nachher (sperren, ändern, aufheben, Server, Beleg, DM).
CREATE TABLE IF NOT EXISTS security_ban_changes (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ban_id     INT UNSIGNED NOT NULL,
    action     ENUM('ban', 'change', 'lift', 'server', 'evidence', 'dm') NOT NULL,
    before_val VARCHAR(200) NULL,
    after_val  VARCHAR(200) NULL,
    note       VARCHAR(500) NULL,
    by_id      VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    by_name    VARCHAR(100) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_ban (ban_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Belege: hochgeladene Bilder oder gespeicherte Discord-Nachrichten.
CREATE TABLE IF NOT EXISTS security_evidence (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ban_id     INT UNSIGNED NOT NULL,
    kind       ENUM('file', 'discord') NOT NULL,
    name       VARCHAR(200) NOT NULL,
    mime       VARCHAR(64)  NULL,
    size       INT UNSIGNED NOT NULL DEFAULT 0,
    data       MEDIUMBLOB   NULL,
    message    JSON         NULL,
    error      VARCHAR(200) NULL,
    by_id      VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_ban (ban_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Anmeldespuren (D3): 90 Tage, außer sie hängen an einer Sperre oder einem offenen Verdacht.
CREATE TABLE IF NOT EXISTS security_logins (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    service    ENUM('dashboard', 'website', 'shop') NOT NULL,
    ip_hash    CHAR(64)     CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    net_hash   CHAR(64)     CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    asn        VARCHAR(20)  NULL,
    vpn        TINYINT(1)   NULL,
    result     ENUM('in', 'marked', 'blocked', 'unchecked', 'banned') NOT NULL,
    reason     VARCHAR(100) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_user (user_id),
    KEY idx_ip (ip_hash),
    KEY idx_net (net_hash),
    KEY idx_time (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Hashes einer Person, die beim Sperren in die Sperre übernommen werden und mit ihr bleiben.
CREATE TABLE IF NOT EXISTS security_ban_hashes (
    ban_id   INT UNSIGNED NOT NULL,
    ip_hash  CHAR(64)     CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    net_hash CHAR(64)     CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (ban_id, ip_hash),
    KEY idx_ip (ip_hash),
    KEY idx_net (net_hash)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Verdacht aus der Prüfung bei der Anmeldung, je Konto und gesperrter Person nur einer offen.
CREATE TABLE IF NOT EXISTS security_suspects (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    ban_id     INT UNSIGNED NULL,
    kind       ENUM('same_ip', 'vpn_young', 'net') NOT NULL,
    service    ENUM('dashboard', 'website', 'shop') NOT NULL,
    state      ENUM('open', 'ok', 'banned') NOT NULL DEFAULT 'open',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    closed_by  VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NULL,
    closed_at  TIMESTAMP(3) NULL,
    open_key   VARCHAR(40)  CHARACTER SET ascii COLLATE ascii_bin AS (IF(state = 'open', CONCAT(user_id, ':', COALESCE(ban_id, 0)), NULL)) PERSISTENT,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_open (open_key),
    KEY idx_state (state)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- „Bot verlässt“ bei einer Sperre (E2) nutzt die Sperrliste aus W-0064.
ALTER TABLE server_blocks ADD COLUMN IF NOT EXISTS origin ENUM('remove', 'ban') NOT NULL DEFAULT 'remove' AFTER reason;
ALTER TABLE server_blocks ADD COLUMN IF NOT EXISTS ban_id INT UNSIGNED NULL AFTER origin;
