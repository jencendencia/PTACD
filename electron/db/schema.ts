// Idempotent schema bootstrap for PTA CD. Runs on every startup so the app
// self-heals. Shares the tapin_school database with TapIn School: this module
// ONLY manages pta_* tables (plus seeds); TapIn owns students/sections/etc.
//
// IMPORTANT: SCHEMA_SQL must contain NO SQL comments and NO ';' characters
// other than statement terminators (ensureSchema splits on ';').
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS pta_users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) DEFAULT NULL,
  full_name VARCHAR(120) NOT NULL DEFAULT '',
  role ENUM('admin','president','vice_president','treasurer','secretary','auditor') NOT NULL DEFAULT 'secretary',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pta_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pta_settings (
  setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
  setting_value TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pta_families (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  family_key VARCHAR(220) NOT NULL,
  guardian_name VARCHAR(120) NOT NULL,
  guardian_address VARCHAR(255) NOT NULL DEFAULT '',
  parent_phone VARCHAR(20) NOT NULL DEFAULT '',
  student_count INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pta_families_key (family_key),
  KEY idx_pta_families_name (guardian_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pta_fee_components (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  label VARCHAR(120) NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  applies ENUM('per_family','per_child') NOT NULL DEFAULT 'per_child',
  term VARCHAR(20) NOT NULL DEFAULT '',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pta_components (code, term)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pta_funds (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pta_funds_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pta_distribution_rules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  component_id INT UNSIGNED NOT NULL,
  fund_id INT UNSIGNED NOT NULL,
  percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_pta_rule (component_id, fund_id),
  CONSTRAINT fk_pta_rule_component FOREIGN KEY (component_id) REFERENCES pta_fee_components(id) ON DELETE CASCADE,
  CONSTRAINT fk_pta_rule_fund FOREIGN KEY (fund_id) REFERENCES pta_funds(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pta_charges (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  family_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  school_year VARCHAR(20) NOT NULL,
  component_id INT UNSIGNED NOT NULL,
  term VARCHAR(20) NOT NULL DEFAULT '',
  amount DECIMAL(12,2) NOT NULL,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pta_charge (student_id, school_year, component_id, term),
  KEY idx_pta_charge_family (family_id, school_year),
  CONSTRAINT fk_pta_charge_family FOREIGN KEY (family_id) REFERENCES pta_families(id) ON DELETE CASCADE,
  CONSTRAINT fk_pta_charge_component FOREIGN KEY (component_id) REFERENCES pta_fee_components(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pta_collections (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  or_no VARCHAR(32) NOT NULL,
  family_id INT UNSIGNED NOT NULL,
  school_year VARCHAR(20) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  collected_at DATETIME NOT NULL,
  collector VARCHAR(120) NOT NULL DEFAULT '',
  notes VARCHAR(255) NOT NULL DEFAULT '',
  voided TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pta_collection_date (collected_at),
  KEY idx_pta_collection_family (family_id),
  CONSTRAINT fk_pta_collection_family FOREIGN KEY (family_id) REFERENCES pta_families(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pta_charge_payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  collection_id BIGINT UNSIGNED NOT NULL,
  charge_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_pta_cp_collection FOREIGN KEY (collection_id) REFERENCES pta_collections(id) ON DELETE CASCADE,
  CONSTRAINT fk_pta_cp_charge FOREIGN KEY (charge_id) REFERENCES pta_charges(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pta_fund_allocations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  collection_id BIGINT UNSIGNED NOT NULL,
  fund_id INT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_pta_fa_collection FOREIGN KEY (collection_id) REFERENCES pta_collections(id) ON DELETE CASCADE,
  CONSTRAINT fk_pta_fa_fund FOREIGN KEY (fund_id) REFERENCES pta_funds(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pta_disbursements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dv_no VARCHAR(32) NOT NULL,
  fund_id INT UNSIGNED NOT NULL,
  payee VARCHAR(120) NOT NULL,
  purpose VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  d_date DATE NOT NULL,
  status ENUM('DRAFT','APPROVED','PAID') NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(120) NOT NULL DEFAULT '',
  approved_by VARCHAR(120) DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  paid_by VARCHAR(120) DEFAULT NULL,
  paid_at DATETIME DEFAULT NULL,
  reference_no VARCHAR(64) NOT NULL DEFAULT '',
  notes VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pta_dv_status (status),
  CONSTRAINT fk_pta_dv_fund FOREIGN KEY (fund_id) REFERENCES pta_funds(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pta_advances (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fund_id INT UNSIGNED NOT NULL,
  recipient VARCHAR(120) NOT NULL,
  purpose VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  date_issued DATE NOT NULL,
  status ENUM('ISSUED','PARTIALLY_LIQUIDATED','LIQUIDATED','RETURNED') NOT NULL DEFAULT 'ISSUED',
  returned_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  additional_release DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_by VARCHAR(120) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pta_advance_fund FOREIGN KEY (fund_id) REFERENCES pta_funds(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pta_liquidation_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  advance_id BIGINT UNSIGNED NOT NULL,
  l_date DATE NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  attachment_id BIGINT UNSIGNED DEFAULT NULL,
  CONSTRAINT fk_pta_liq_advance FOREIGN KEY (advance_id) REFERENCES pta_advances(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pta_attachments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entity VARCHAR(32) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  stored_path VARCHAR(500) NOT NULL DEFAULT '',
  mime VARCHAR(100) NOT NULL DEFAULT '',
  size INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pta_attachment_entity (entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO pta_funds (name, description) VALUES ('General Fund', 'PTA general operating fund');
INSERT IGNORE INTO pta_fee_components (code, label, amount, applies, sort_order) VALUES ('MEMBERSHIP', 'Membership Fee', 200, 'per_family', 1);
INSERT IGNORE INTO pta_fee_components (code, label, amount, applies, sort_order) VALUES ('MISC', 'Miscellaneous', 200, 'per_child', 2);
INSERT IGNORE INTO pta_fee_components (code, label, amount, applies, sort_order) VALUES ('OTHER', 'Other Collectibles', 250, 'per_child', 3);
INSERT IGNORE INTO pta_distribution_rules (component_id, fund_id, percentage) SELECT id, (SELECT id FROM pta_funds WHERE name = 'General Fund'), 100 FROM pta_fee_components;
`;

export async function ensureSchema(query: (sql: string, params?: unknown[]) => Promise<unknown[]>): Promise<void> {
  for (const stmt of SCHEMA_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
    await query(stmt);
  }
}
