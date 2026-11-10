-- W-0062: News (Beiträge, Kurzmeldungen, Termine). details enthält summary, cover,
-- blocks, event und announce aus IPostInput (shared/news.ts).

CREATE TABLE IF NOT EXISTS news_posts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(60) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    kind ENUM('beitrag', 'kurz', 'termin') NOT NULL,
    category ENUM('update', 'partner', 'turnier', 'ankuendigung', 'wartung') NOT NULL,
    title VARCHAR(120) NOT NULL,
    status ENUM('draft', 'scheduled', 'published') NOT NULL DEFAULT 'draft',
    publish_at DATETIME(3) NULL,
    published_at DATETIME(3) NULL,
    pinned ENUM('none', 'big', 'small') NOT NULL DEFAULT 'none',
    entry_id INT UNSIGNED NULL,
    details JSON NOT NULL,
    announced_message_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    announced_at DATETIME(3) NULL,
    author_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    author_name VARCHAR(100) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_news_slug (slug),
    KEY idx_news_due (status, publish_at),
    KEY idx_news_entry (entry_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
