-- Was bei einer Löschung bleibt (W-0051). Ohne Zeile gilt die Vorgabe aus
-- shared/userdata.ts. Wer es geändert hat, steht im Protokoll.
CREATE TABLE IF NOT EXISTS userdata_rules (
    area       VARCHAR(32)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    keep       TINYINT(1)   NOT NULL,
    note       VARCHAR(200) NULL,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (area)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
