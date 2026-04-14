-- Partition price_history by recorded_at (monthly RANGE partitions).
-- Drops the serial `id` column — it was never FK-referenced and is not used by any query.
-- Natural key (printing_id, store_id, price_type, recorded_at) enforces uniqueness per partition.
-- Partitions cover 2025-01 → 2028-12 plus a DEFAULT catch-all for out-of-range dates.
--
-- Recovery if this migration fails mid-run:
--   DROP TABLE IF EXISTS price_history CASCADE;
--   ALTER TABLE IF EXISTS price_history_old RENAME TO price_history;
--   ALTER INDEX IF EXISTS price_history_old_unique_daily_idx RENAME TO price_history_unique_daily_idx;
--   ALTER INDEX IF EXISTS price_history_old_recorded_at_idx  RENAME TO price_history_recorded_at_idx;
--   Then re-run the migration.
--
-- To drop old monthly partitions (>2 years old) run:
--   DROP TABLE price_history_YYYY_MM;
-- The DEFAULT partition catches any rows that don't fit a named range.

-- Step 1: Rename existing table + its indexes to free the names for the new partitioned table.
-- (If price_history doesn't exist — e.g. dev env after a failed migration — these are no-ops
--  via the IF EXISTS guards. The CREATE TABLE below will then just create fresh.)
ALTER INDEX IF EXISTS price_history_unique_daily_idx RENAME TO price_history_old_unique_daily_idx;
--> statement-breakpoint
ALTER INDEX IF EXISTS price_history_recorded_at_idx  RENAME TO price_history_old_recorded_at_idx;
--> statement-breakpoint
ALTER TABLE IF EXISTS price_history RENAME TO price_history_old;
--> statement-breakpoint

-- Step 2: Create new partitioned parent (no id column)
CREATE TABLE price_history (
    printing_id  TEXT NOT NULL,
    store_id     TEXT NOT NULL,
    price_aud    TEXT NOT NULL,
    price_type   TEXT NOT NULL,
    recorded_at  DATE NOT NULL
) PARTITION BY RANGE (recorded_at);
--> statement-breakpoint

-- Step 3: FK constraints on the partitioned parent (inherited by all child partitions)
ALTER TABLE price_history
    ADD CONSTRAINT price_history_printing_id_printings_id_fk
    FOREIGN KEY (printing_id) REFERENCES printings(id);
--> statement-breakpoint
ALTER TABLE price_history
    ADD CONSTRAINT price_history_store_id_stores_id_fk
    FOREIGN KEY (store_id) REFERENCES stores(id);
--> statement-breakpoint

-- Step 4: Monthly partitions 2025-01 → 2028-12
CREATE TABLE price_history_2025_01 PARTITION OF price_history FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
--> statement-breakpoint
CREATE TABLE price_history_2025_02 PARTITION OF price_history FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
--> statement-breakpoint
CREATE TABLE price_history_2025_03 PARTITION OF price_history FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
--> statement-breakpoint
CREATE TABLE price_history_2025_04 PARTITION OF price_history FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
--> statement-breakpoint
CREATE TABLE price_history_2025_05 PARTITION OF price_history FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
--> statement-breakpoint
CREATE TABLE price_history_2025_06 PARTITION OF price_history FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
--> statement-breakpoint
CREATE TABLE price_history_2025_07 PARTITION OF price_history FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
--> statement-breakpoint
CREATE TABLE price_history_2025_08 PARTITION OF price_history FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
--> statement-breakpoint
CREATE TABLE price_history_2025_09 PARTITION OF price_history FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
--> statement-breakpoint
CREATE TABLE price_history_2025_10 PARTITION OF price_history FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
--> statement-breakpoint
CREATE TABLE price_history_2025_11 PARTITION OF price_history FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
--> statement-breakpoint
CREATE TABLE price_history_2025_12 PARTITION OF price_history FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
--> statement-breakpoint
CREATE TABLE price_history_2026_01 PARTITION OF price_history FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
--> statement-breakpoint
CREATE TABLE price_history_2026_02 PARTITION OF price_history FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
--> statement-breakpoint
CREATE TABLE price_history_2026_03 PARTITION OF price_history FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
--> statement-breakpoint
CREATE TABLE price_history_2026_04 PARTITION OF price_history FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
--> statement-breakpoint
CREATE TABLE price_history_2026_05 PARTITION OF price_history FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
--> statement-breakpoint
CREATE TABLE price_history_2026_06 PARTITION OF price_history FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
--> statement-breakpoint
CREATE TABLE price_history_2026_07 PARTITION OF price_history FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
--> statement-breakpoint
CREATE TABLE price_history_2026_08 PARTITION OF price_history FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
--> statement-breakpoint
CREATE TABLE price_history_2026_09 PARTITION OF price_history FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
--> statement-breakpoint
CREATE TABLE price_history_2026_10 PARTITION OF price_history FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
--> statement-breakpoint
CREATE TABLE price_history_2026_11 PARTITION OF price_history FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
--> statement-breakpoint
CREATE TABLE price_history_2026_12 PARTITION OF price_history FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
--> statement-breakpoint
CREATE TABLE price_history_2027_01 PARTITION OF price_history FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
--> statement-breakpoint
CREATE TABLE price_history_2027_02 PARTITION OF price_history FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
--> statement-breakpoint
CREATE TABLE price_history_2027_03 PARTITION OF price_history FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
--> statement-breakpoint
CREATE TABLE price_history_2027_04 PARTITION OF price_history FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
--> statement-breakpoint
CREATE TABLE price_history_2027_05 PARTITION OF price_history FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
--> statement-breakpoint
CREATE TABLE price_history_2027_06 PARTITION OF price_history FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
--> statement-breakpoint
CREATE TABLE price_history_2027_07 PARTITION OF price_history FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');
--> statement-breakpoint
CREATE TABLE price_history_2027_08 PARTITION OF price_history FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');
--> statement-breakpoint
CREATE TABLE price_history_2027_09 PARTITION OF price_history FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');
--> statement-breakpoint
CREATE TABLE price_history_2027_10 PARTITION OF price_history FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');
--> statement-breakpoint
CREATE TABLE price_history_2027_11 PARTITION OF price_history FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');
--> statement-breakpoint
CREATE TABLE price_history_2027_12 PARTITION OF price_history FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');
--> statement-breakpoint
CREATE TABLE price_history_2028_01 PARTITION OF price_history FOR VALUES FROM ('2028-01-01') TO ('2028-02-01');
--> statement-breakpoint
CREATE TABLE price_history_2028_02 PARTITION OF price_history FOR VALUES FROM ('2028-02-01') TO ('2028-03-01');
--> statement-breakpoint
CREATE TABLE price_history_2028_03 PARTITION OF price_history FOR VALUES FROM ('2028-03-01') TO ('2028-04-01');
--> statement-breakpoint
CREATE TABLE price_history_2028_04 PARTITION OF price_history FOR VALUES FROM ('2028-04-01') TO ('2028-05-01');
--> statement-breakpoint
CREATE TABLE price_history_2028_05 PARTITION OF price_history FOR VALUES FROM ('2028-05-01') TO ('2028-06-01');
--> statement-breakpoint
CREATE TABLE price_history_2028_06 PARTITION OF price_history FOR VALUES FROM ('2028-06-01') TO ('2028-07-01');
--> statement-breakpoint
CREATE TABLE price_history_2028_07 PARTITION OF price_history FOR VALUES FROM ('2028-07-01') TO ('2028-08-01');
--> statement-breakpoint
CREATE TABLE price_history_2028_08 PARTITION OF price_history FOR VALUES FROM ('2028-08-01') TO ('2028-09-01');
--> statement-breakpoint
CREATE TABLE price_history_2028_09 PARTITION OF price_history FOR VALUES FROM ('2028-09-01') TO ('2028-10-01');
--> statement-breakpoint
CREATE TABLE price_history_2028_10 PARTITION OF price_history FOR VALUES FROM ('2028-10-01') TO ('2028-11-01');
--> statement-breakpoint
CREATE TABLE price_history_2028_11 PARTITION OF price_history FOR VALUES FROM ('2028-11-01') TO ('2028-12-01');
--> statement-breakpoint
CREATE TABLE price_history_2028_12 PARTITION OF price_history FOR VALUES FROM ('2028-12-01') TO ('2029-01-01');
--> statement-breakpoint

-- DEFAULT partition catches any dates outside the named ranges (pre-2025 or post-2028)
CREATE TABLE price_history_default PARTITION OF price_history DEFAULT;
--> statement-breakpoint

-- Step 5: Indexes on the parent (automatically propagated to all child partitions)
-- Unique index includes the partition key (recorded_at) — required for partitioned tables
CREATE UNIQUE INDEX price_history_unique_daily_idx
    ON price_history (printing_id, store_id, price_type, recorded_at);
--> statement-breakpoint
CREATE INDEX price_history_recorded_at_idx ON price_history (recorded_at);
--> statement-breakpoint
CREATE INDEX price_history_store_id_idx ON price_history (store_id);
--> statement-breakpoint

-- Step 6: Copy existing data if the old table exists (prod has 2.7M rows; dev was empty).
INSERT INTO price_history (printing_id, store_id, price_aud, price_type, recorded_at)
SELECT printing_id, store_id, price_aud, price_type, recorded_at
FROM price_history_old
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Step 7: Drop the old table now that data is safely in the partitioned table.
DROP TABLE IF EXISTS price_history_old;
