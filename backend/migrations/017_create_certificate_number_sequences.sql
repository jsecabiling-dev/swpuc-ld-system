CREATE TABLE IF NOT EXISTS certificate_number_sequences (
    period_key CHAR(7) NOT NULL,
    last_series INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (period_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
