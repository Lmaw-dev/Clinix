CREATE DATABASE IF NOT EXISTS clinix CHARACTER
SET
  utf8mb4 COLLATE utf8mb4_unicode_ci;

USE clinix;

CREATE TABLE colleges (
  code VARCHAR(16) PRIMARY KEY,
  name VARCHAR(100) NOT NULL
) ENGINE = InnoDB;

CREATE TABLE courses (
  code VARCHAR(32) PRIMARY KEY,
  college_code VARCHAR(16) NOT NULL,
  name VARCHAR(100) NOT NULL,
  CONSTRAINT fk_courses_college FOREIGN KEY (college_code) REFERENCES colleges (code) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE students (
  student_id CHAR(6) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  first_name VARCHAR(80) NOT NULL,
  middle_name VARCHAR(80) NULL,
  course_code VARCHAR(32) NOT NULL,
  year_level ENUM ('1st Year', '2nd Year', '3rd Year', '4th Year') NOT NULL,
  gender VARCHAR(40) NOT NULL,
  contact_number VARCHAR(32) NULL,
  email TEXT NULL,
  medical_conditions TEXT NULL,
  -- A graduate keeps their row and their medical history; only this column
  -- moves. See date_graduated / status_updated_* below for the audit trail.
  status ENUM ('enrolled', 'graduated', 'dropped') NOT NULL DEFAULT 'enrolled',
  date_graduated DATE NULL,
  status_updated_at DATETIME NULL,
  -- accounts.id, which is VARCHAR(40)
  status_updated_by VARCHAR(40) NULL,
  photo LONGTEXT NULL,
  birthdate TEXT NULL,
  blood_type TEXT NULL,
  school_year TEXT NULL,
  guardian_name TEXT NULL,
  guardian_relationship TEXT NULL,
  guardian_contact TEXT NULL,
  confidential_notes TEXT NULL,
  allergies TEXT NULL,
  current_medications TEXT NULL,
  medical_others TEXT NULL,
  height TEXT NULL,
  weight TEXT NULL,
  current_province TEXT NULL,
  current_city TEXT NULL,
  current_barangay TEXT NULL,
  current_purok TEXT NULL,
  current_zip TEXT NULL,
  home_province TEXT NULL,
  home_city TEXT NULL,
  home_barangay TEXT NULL,
  home_purok TEXT NULL,
  home_zip TEXT NULL,
  is_boarding TINYINT(1) NOT NULL DEFAULT 0,
  boarding_house_name TEXT NULL,
  boarding_house_address TEXT NULL,
  landlord_name TEXT NULL,
  landlord_contact TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_students_status (status),
  CONSTRAINT fk_students_course FOREIGN KEY (course_code) REFERENCES courses (code) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_students_id_digits CHECK (student_id REGEXP '^[0-9]{6}$')
) ENGINE = InnoDB;

CREATE TABLE faculty (
  staff_id VARCHAR(16) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  role VARCHAR(120) NOT NULL,
  contact VARCHAR(32) NULL,
  medical_history TEXT NULL,
  photo LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE = InnoDB;

CREATE TABLE medical_records (
  id VARCHAR(40) PRIMARY KEY,
  student_id CHAR(6) NOT NULL,
  name VARCHAR(160) NOT NULL,
  summary TEXT NOT NULL,
  record_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_medical_records_student FOREIGN KEY (student_id) REFERENCES students (student_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE visits (
  id VARCHAR(40) PRIMARY KEY,
  student_id CHAR(6) NOT NULL,
  student_name VARCHAR(160) NOT NULL,
  visit_date DATE NOT NULL,
  reason TEXT NOT NULL,
  staff VARCHAR(160) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_visits_student FOREIGN KEY (student_id) REFERENCES students (student_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE inventory_items (
  code VARCHAR(40) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  qty INT NOT NULL DEFAULT 0,
  unit VARCHAR(40) NOT NULL,
  expiry DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_inventory_qty CHECK (qty >= 0)
) ENGINE = InnoDB;

CREATE TABLE certificates (
  id VARCHAR(40) PRIMARY KEY,
  student_id CHAR(6) NOT NULL,
  student_name VARCHAR(160) NOT NULL,
  certificate_date DATE NOT NULL,
  status VARCHAR(60) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_certificates_student FOREIGN KEY (student_id) REFERENCES students (student_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE = InnoDB;

-- The consultation log. A visit may belong to a student, a faculty member, or a
-- walk-in with no ID at all, so student_id is a plain optional column with no
-- foreign key to students. Personal and health fields are stored encrypted;
-- date, time, purpose and status stay readable for ordering and reporting.
CREATE TABLE consultations (
  id VARCHAR(40) PRIMARY KEY,
  student_id VARCHAR(40) NULL,
  student_name TEXT NULL,
  consultation_date DATE NULL,
  visit_time VARCHAR(10) NULL,
  age TEXT NULL,
  sex TEXT NULL,
  course_or_office TEXT NULL,
  purpose VARCHAR(24) NULL,
  chief_complaint TEXT NULL,
  management TEXT NULL,
  summary TEXT NULL,
  outcome TEXT NULL,
  reason TEXT NULL,
  staff TEXT NULL,
  person_type VARCHAR(16) NULL,
  blood_type TEXT NULL,
  vital_bp TEXT NULL,
  vital_rr TEXT NULL,
  vital_pr TEXT NULL,
  vital_temp TEXT NULL,
  vital_o2sat TEXT NULL,
  assessment TEXT NULL,
  recorded_at VARCHAR(40) NULL,
  consult_status VARCHAR(16) NULL,
  recorded_by TEXT NULL,
  evaluated_by TEXT NULL,
  confirmed_by TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_consult_purpose (purpose)
) ENGINE = InnoDB;

CREATE TABLE activities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  msg TEXT NOT NULL,
  ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE = InnoDB;

CREATE TABLE admin_profile (
  id TINYINT PRIMARY KEY DEFAULT 1,
  name VARCHAR(160) NOT NULL DEFAULT 'Clinic Admin',
  photo LONGTEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_admin_profile_singleton CHECK (id = 1)
) ENGINE = InnoDB;

INSERT INTO
  colleges (code, name)
VALUES
  ('CTECH', 'College of Technology'),
  ('CTE', 'College of Teacher Education'),
  ('COM', 'College of Management'),
  ('COF', 'College of Fisheries') ON DUPLICATE KEY
UPDATE name =
VALUES
  (name);

INSERT INTO
  courses (code, college_code, name)
VALUES
  (
    'BSCS',
    'CTECH',
    'Bachelor of Science in Computer Science'
  ),
  (
    'BSIT-FPST',
    'CTECH',
    'Bachelor of Science in Industrial Technology - Food Preparation and Service Technology'
  ),
  (
    'BSIT-ELECT',
    'CTECH',
    'Bachelor of Science in Industrial Technology - Electrical Technology'
  ),
  ('BEED', 'CTE', 'Bachelor of Elementary Education'),
  (
    'BSED-ENGLISH',
    'CTE',
    'Bachelor of Secondary Education - English'
  ),
  (
    'BSED-MATH',
    'CTE',
    'Bachelor of Secondary Education - Mathematics'
  ),
  ('BSM', 'COM', 'Bachelor of Science in Management'),
  ('BSF', 'COF', 'Bachelor of Science in Fisheries') ON DUPLICATE KEY
UPDATE college_code =
VALUES
  (college_code),
  name =
VALUES
  (name);

INSERT INTO
  admin_profile (id, name)
VALUES
  (1, 'Clinic Admin') ON DUPLICATE KEY
UPDATE name =
VALUES
  (name);