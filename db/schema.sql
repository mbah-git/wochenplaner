-- WochenPlaner Datenbankschema (MySQL 5.7+ / MariaDB 10.3+)
-- Idempotent: kann beliebig oft ausgefuehrt werden.

-- Ein Haushalt teilt Rezepte, Wochenplan und Einkaufsliste. Jeder Benutzer gehoert zu genau einem.
CREATE TABLE IF NOT EXISTS households (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(100) NOT NULL,
  invite_code CHAR(8) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_households_invite (invite_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  household_id  INT UNSIGNED NOT NULL,
  email         VARCHAR(190) NOT NULL,
  name          VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('user','admin') NOT NULL DEFAULT 'user',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_household (household_id),
  CONSTRAINT fk_users_household FOREIGN KEY (household_id) REFERENCES households (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recipes (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  household_id INT UNSIGNED NOT NULL,
  created_by   INT UNSIGNED NULL,
  name         VARCHAR(150) NOT NULL,
  servings     TINYINT UNSIGNED NOT NULL DEFAULT 2,
  tags         VARCHAR(255) NULL,
  source_url   VARCHAR(500) NULL,
  instructions TEXT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_recipes_household (household_id),
  CONSTRAINT fk_recipes_household FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
  CONSTRAINT fk_recipes_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- quantity NULL = ohne Mengenangabe (z. B. "Salz")
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipe_id INT UNSIGNED NOT NULL,
  position  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  quantity  DECIMAL(10,3) NULL,
  unit      VARCHAR(20) NULL,
  name      VARCHAR(120) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_recipe_ingredients_recipe (recipe_id),
  CONSTRAINT fk_recipe_ingredients_recipe FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Wochenplan: pro Tag und Mahlzeit entweder ein Rezept oder Freitext
CREATE TABLE IF NOT EXISTS meal_plan (
  household_id INT UNSIGNED NOT NULL,
  plan_date    DATE NOT NULL,
  slot         ENUM('lunch','dinner') NOT NULL,
  recipe_id    INT UNSIGNED NULL,
  note         VARCHAR(200) NULL,
  servings     TINYINT UNSIGNED NULL,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (household_id, plan_date, slot),
  CONSTRAINT fk_meal_plan_household FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
  CONSTRAINT fk_meal_plan_recipe FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Eigene Eintraege auf der Einkaufsliste einer Woche
CREATE TABLE IF NOT EXISTS shopping_items (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  household_id INT UNSIGNED NOT NULL,
  week_start   DATE NOT NULL,
  name         VARCHAR(120) NOT NULL,
  amount       VARCHAR(40) NULL,
  category     VARCHAR(30) NOT NULL,
  checked      TINYINT(1) NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_shopping_items_week (household_id, week_start),
  CONSTRAINT fk_shopping_items_household FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Abgehakte Zutaten der automatisch erzeugten Liste (Schluessel = normalisierter Zutatenname)
CREATE TABLE IF NOT EXISTS shopping_checks (
  household_id INT UNSIGNED NOT NULL,
  week_start   DATE NOT NULL,
  item_key     VARCHAR(120) NOT NULL,
  PRIMARY KEY (household_id, week_start, item_key),
  CONSTRAINT fk_shopping_checks_household FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vom Haushalt festgelegte Kategorie einer Zutat (ueberschreibt die automatische Zuordnung)
CREATE TABLE IF NOT EXISTS ingredient_categories (
  household_id INT UNSIGNED NOT NULL,
  item_key     VARCHAR(120) NOT NULL,
  category     VARCHAR(30) NOT NULL,
  PRIMARY KEY (household_id, item_key),
  CONSTRAINT fk_ingredient_categories_household FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Einmal-Links zum Zuruecksetzen des Passworts (nur der SHA-256-Hash des Tokens wird gespeichert)
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash CHAR(64) NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  KEY idx_password_resets_user (user_id),
  CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
