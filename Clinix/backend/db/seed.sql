USE clinix;

INSERT INTO students
  (student_id, name, last_name, first_name, middle_name, course_code, year_level, gender, contact_number, medical_conditions, status)
VALUES
  ('121451', 'Jessa Salazar', 'Salazar', 'Jessa', '', 'BSCS', '3rd Year', 'Female', '0917 555 0123', 'Seasonal allergies', 'enrolled'),
  ('432652', 'Ronaldo Mendez', 'Mendez', 'Ronaldo', '', 'BSED-MATH', '2nd Year', 'Male', '0918 555 0148', 'None recorded', 'enrolled'),
  ('543293', 'Paula Lazo', 'Lazo', 'Paula', '', 'BSIT-FPST', '4th Year', 'Female', '0991 555 0175', 'Mild asthma', 'enrolled'),
  ('324514', 'Arvin dela Cruz', 'dela Cruz', 'Arvin', '', 'BSM', '1st Year', 'Male', '0932 555 0199', 'Migraines', 'enrolled')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  last_name = VALUES(last_name),
  first_name = VALUES(first_name),
  middle_name = VALUES(middle_name),
  course_code = VALUES(course_code),
  year_level = VALUES(year_level),
  gender = VALUES(gender),
  contact_number = VALUES(contact_number),
  medical_conditions = VALUES(medical_conditions),
  status = VALUES(status);

INSERT INTO faculty (staff_id, name, role, contact, medical_history)
VALUES
  ('F001', 'Dr. Maria Santos', 'Clinic Physician', '0917 111 2233', 'Hypertension - monitoring'),
  ('F002', 'Nurse Pedro Cruz', 'Nurse', '0918 222 3344', 'None recorded')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  role = VALUES(role),
  contact = VALUES(contact),
  medical_history = VALUES(medical_history);
