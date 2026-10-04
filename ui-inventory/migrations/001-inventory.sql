-- MySQL 8.0+, InnoDB. Run schema preflight and backup BEFORE this migration.
-- These tables extend the existing authority/ledger; do not enable legacy writers.
CREATE TABLE IF NOT EXISTS character_inventory_state (
  character_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  state_json JSON NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS inventory_operations (
  character_id BIGINT UNSIGNED NOT NULL,
  operation_id VARCHAR(100) COLLATE utf8mb4_bin NOT NULL,
  fingerprint CHAR(64) NOT NULL,
  action VARCHAR(64) NOT NULL,
  correlation_id VARCHAR(100) NOT NULL,
  result_json JSON NOT NULL,
  status ENUM('rejected','pending','applied') NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY(character_id,operation_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS inventory_outbox (
  id CHAR(36) NOT NULL PRIMARY KEY,
  operation_id VARCHAR(100) COLLATE utf8mb4_bin NOT NULL,
  character_id BIGINT UNSIGNED NOT NULL,
  effect_json JSON NOT NULL,
  status ENUM('pending','applying','applied') NOT NULL,
  lease_token CHAR(36) NULL,
  lease_until TIMESTAMP(3) NULL,
  available_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  last_error VARCHAR(64) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX outbox_claim(status,available_at,lease_until),
  INDEX outbox_operation(character_id,operation_id,status)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS inventory_alerts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  character_id BIGINT UNSIGNED NOT NULL,
  operation_id VARCHAR(100) NOT NULL,
  code VARCHAR(64) NOT NULL,
  details_json JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX alerts_character(character_id,created_at)
) ENGINE=InnoDB;
-- Apply once, using the migration runner (column existence is checked there).
ALTER TABLE inventory_transactions ADD COLUMN operation_id VARCHAR(100) COLLATE utf8mb4_bin NULL;
ALTER TABLE inventory_transactions ADD COLUMN item_instance_id VARCHAR(100) NULL;
ALTER TABLE inventory_transactions ADD COLUMN details_json JSON NULL;
CREATE INDEX inventory_operation ON inventory_transactions(operation_id,character_id);
CREATE INDEX inventory_instance ON inventory_transactions(item_instance_id,created_at);
