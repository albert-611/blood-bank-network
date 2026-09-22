/**
 * Verification script for Test 4: Real Database Inspection
 */
const mysql = require('mysql2/promise');

async function verify() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'blood_bank_db'
  });

  // Clean if already there
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  await pool.query("DELETE FROM users WHERE email = 'admin@stmaryhealth.org'");
  await pool.query("DELETE FROM organizations WHERE email = 'info@stmaryhealth.org'");
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');

  // Submit via live API
  const payload = {
    organization: {
      name: 'St. Mary Health Pavilion',
      type: 'HOSPITAL',
      email: 'info@stmaryhealth.org',
      phone: '+1-555-0811',
      address: '700 Health Blvd',
      city: 'Metro City',
      country: 'USA'
    },
    admin: {
      name: 'Dr. Gregory House',
      email: 'admin@stmaryhealth.org',
      phone: '+1-555-0812',
      password: 'HousePassword123!',
      confirm_password: 'HousePassword123!'
    }
  };

  const res = await fetch('http://localhost:5000/api/organizations/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  console.log('HTTP Status:', res.status);
  const json = await res.json();
  console.log('API Response:', JSON.stringify(json, null, 2));

  // Query Database
  const [orgRows] = await pool.query('SELECT * FROM organizations WHERE email = ?', ['info@stmaryhealth.org']);
  console.log('\n--- Database: organizations row ---');
  console.log(orgRows[0]);

  const [hospRows] = await pool.query('SELECT * FROM hospitals WHERE organization_id = ?', [orgRows[0].id]);
  console.log('\n--- Database: hospitals row ---');
  console.log(hospRows[0]);

  const [userRows] = await pool.query('SELECT id, full_name, email, organization_id, global_role, status, password_hash FROM users WHERE email = ?', ['admin@stmaryhealth.org']);
  console.log('\n--- Database: users row ---');
  console.log(userRows[0]);

  const [staffRows] = await pool.query('SELECT os.*, r.name as role_name FROM organization_staff os JOIN roles r ON os.role_id = r.id WHERE os.organization_id = ?', [orgRows[0].id]);
  console.log('\n--- Database: organization_staff row ---');
  console.log(staffRows[0]);

  // Assertions
  const org = orgRows[0];
  const admin = userRows[0];
  const staff = staffRows[0];

  console.log('\n=== REAL DATABASE ASSERTIONS ===');
  console.log('1. Organization exists:', Boolean(org));
  console.log('2. Organization type === "HOSPITAL":', org.type === 'HOSPITAL');
  console.log('3. Organization status === "PENDING":', org.status === 'PENDING');
  console.log('4. Admin user exists:', Boolean(admin));
  console.log('5. Admin user organization_id === org.id:', admin.organization_id === org.id);
  console.log('6. Staff organization_id === org.id:', staff.organization_id === org.id);
  console.log('7. Staff role === "ORGANIZATION_ADMIN":', staff.role_name === 'ORGANIZATION_ADMIN');
  console.log('8. Password is hashed (bcrypt):', admin.password_hash.startsWith('$2'));

  await pool.end();
}

verify().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
