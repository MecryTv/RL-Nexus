-- Fehlerberichte für die Devs (Plan 24, docs/DevLogs.md, Abschnitt Guardian).
-- Je Auftreten eine Zeile, auch wenn die DM zusammengefasst wurde: So findet der
-- Support jede ID, die ein Nutzer nennt. dms: [{ userId, channelId, messageId }]
-- je Dev, damit „Erledigt“ alle DMs ändern und das Aufräumen sie löschen kann.
-- Nach 90 Tagen löscht ErrorReportsPrune Zeile und DMs.
CREATE TABLE IF NOT EXISTS error_reports (
    id         VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    kind       ENUM('bot', 'dashboard', 'report') NOT NULL,
    signature  VARCHAR(255) NOT NULL,
    session    INT NULL,
    dms        JSON NULL,
    done_by    VARCHAR(100) NULL,
    done_at    DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_error_report_signature (signature),
    KEY idx_error_report_created (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
