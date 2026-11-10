-- W-0062: Wer eine Version gepostet hat, für die öffentliche Seite der Version.

ALTER TABLE changelog_versions ADD COLUMN IF NOT EXISTS posted_by_name VARCHAR(100) NULL;
