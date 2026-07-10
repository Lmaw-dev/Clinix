# Clinix Backend

Local MySQL database setup for the Clinix clinic records system.

## Setup

1. Start MySQL locally, for example through XAMPP.
2. Install API dependencies:

```powershell
npm install
```

3. Create the database tables:

```powershell
Get-Content db\schema.sql | mysql -u root
```

4. Optional sample data:

```powershell
Get-Content db\seed.sql | mysql -u root clinix
```

If your database was created before separated student names, import
`db\upgrade-name-parts.sql` once in phpMyAdmin.

5. Run the API:

```powershell
npm run dev
```

## Endpoints

- `GET /api/health`
- `GET /api/students`
- `GET /api/students?college=CTECH&course=BSCS&yearLevel=1st%20Year`
- `GET /api/students/:id`
- `POST /api/students`
- `PUT /api/students/:id`
- `DELETE /api/students/:id`

The same CRUD shape exists for `faculty`, `medicalRecords`, `visits`,
`inventory`, `certificates`, `consultations`, and `activities`.

The student module reads and writes through this API. Other modules still keep
their current local frontend state until they are wired the same way.
