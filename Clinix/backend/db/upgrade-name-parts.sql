USE clinix;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(80) NULL AFTER name,
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(80) NULL AFTER last_name,
  ADD COLUMN IF NOT EXISTS middle_name VARCHAR(80) NULL AFTER first_name;

UPDATE students
SET
  first_name = COALESCE(NULLIF(first_name, ''), SUBSTRING_INDEX(name, ' ', 1)),
  last_name = COALESCE(NULLIF(last_name, ''), SUBSTRING_INDEX(name, ' ', -1)),
  middle_name = COALESCE(middle_name, '');

ALTER TABLE students
  MODIFY last_name VARCHAR(80) NOT NULL,
  MODIFY first_name VARCHAR(80) NOT NULL,
  MODIFY middle_name VARCHAR(80) NULL;
