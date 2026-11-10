-- W-0062: Partner, Sponsoren und Unterstützer, ihre Turniere und der Stand der Rolle @Partner.
-- details enthält alles aus IEntryInput (shared/partners.ts) außer den eigenen Spalten.

CREATE TABLE IF NOT EXISTS partner_entries (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    kind ENUM('partner', 'sponsor', 'supporter') NOT NULL,
    slug VARCHAR(60) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name VARCHAR(80) NOT NULL,
    details JSON NOT NULL,
    contact_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    access ENUM('free', 'paid') NULL,
    -- 1: dieser Eintrag hat dem Ansprechpartner die Gruppe Partner gegeben
    group_granted TINYINT(1) NOT NULL DEFAULT 0,
    -- Verknüpfter Discord-Server für die Live-Zahlen. Bewusst nicht guild_id: Das sind
    -- keine Daten des Servers, die Server-Backups sollen sie nicht mitnehmen.
    server_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    visible TINYINT(1) NOT NULL DEFAULT 1,
    position INT NOT NULL DEFAULT 0,
    created_by VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_name VARCHAR(100) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_partner_slug (slug),
    KEY idx_partner_contact (contact_id),
    KEY idx_partner_kind (kind, position)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS partner_tournaments (
    entry_id INT UNSIGNED NOT NULL,
    post_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (entry_id, post_id),
    KEY idx_tournament_post (post_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS partner_roles (
    user_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    -- given: vergeben, pending: wartet auf Beitritt, missing: fehlt (note sagt warum)
    state ENUM('given', 'pending', 'missing') NOT NULL,
    note VARCHAR(190) NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
