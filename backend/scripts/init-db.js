/**
 * ============================================================================
 * BLOOD BANK PLATFORM — AUTOMATED DATABASE INITIALIZER & SEED RUNNER
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9, §10, §31 Phase 2)
 *
 * Usage:
 *   node backend/scripts/init-db.js             # Full initialization (schema + seed)
 *   node backend/scripts/init-db.js --seed-only # Run seed data only without dropping tables
 *   node backend/scripts/init-db.js --help      # Show CLI help
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Load environment variables from repository root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'blood_bank_db';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;

const SCHEMA_PATH = path.join(__dirname, '../../database/schema.sql');
const SEED_PATH = path.join(__dirname, '../../database/seed.sql');

// Parse command line arguments
const args = process.argv.slice(2);
const isSeedOnly = args.includes('--seed-only');
const isHelp = args.includes('--help') || args.includes('-h');

if (isHelp) {
  console.log(`
🩸 Blood Bank Platform — Database CLI Tool

Usage:
  npm run db:init           Full initialization: drops existing tables, rebuilds schema, loads seed data.
  npm run db:seed           Seed only: inserts or refreshes seed records without dropping schema.
  node backend/scripts/init-db.js --help  Display this help message.

Environment Configuration (.env):
  DB_HOST:     ${DB_HOST}
  DB_PORT:     ${DB_PORT}
  DB_USER:     ${DB_USER}
  DB_NAME:     ${DB_NAME}
  DB_PASSWORD: ${DB_PASSWORD ? '********' : '(empty)'}
`);
  process.exit(0);
}

async function run() {
  console.log(`\n================================================================`);
  console.log(`🩸 BLOOD BANK PLATFORM — DATABASE INITIALIZER`);
  console.log(`================================================================`);
  console.log(`Connecting to: ${DB_USER}@${DB_HOST}:${DB_PORT}`);
  console.log(`Target Database: ${DB_NAME}`);
  console.log(`Execution Mode: ${isSeedOnly ? 'SEED ONLY (preserve schema)' : 'FULL INIT (rebuild schema + seed)'}`);
  console.log(`----------------------------------------------------------------`);

  let connection;

  try {
    // Step 1: Connect to server without database to ensure DB exists
    const rootConnection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD
    });

    await rootConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    await rootConnection.end();
    console.log(`✅ Step 1: Database '${DB_NAME}' verified/created.`);

    // Step 2: Connect directly to the database with multipleStatements enabled
    connection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      multipleStatements: true
    });

    // Step 3: Run Schema if not in seed-only mode
    if (!isSeedOnly) {
      if (!fs.existsSync(SCHEMA_PATH)) {
        throw new Error(`Schema file not found at: ${SCHEMA_PATH}`);
      }
      console.log(`⏳ Step 2: Executing schema definitions from database/schema.sql...`);
      const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
      await connection.query(schemaSql);
      console.log(`✅ Step 2: Schema created successfully (all 19 tables initialized).`);
    } else {
      console.log(`⏩ Step 2: Skipped schema rebuild (--seed-only flag provided).`);
    }

    // Step 4: Run Seed Data
    if (!fs.existsSync(SEED_PATH)) {
      throw new Error(`Seed file not found at: ${SEED_PATH}`);
    }
    console.log(`⏳ Step 3: Inserting seed records from database/seed.sql...`);
    const seedSql = fs.readFileSync(SEED_PATH, 'utf8');
    await connection.query(seedSql);
    console.log(`✅ Step 3: Seed data inserted successfully.`);

    // Step 5: Verification & Record Counts
    console.log(`\n📊 Data Verification Summary:`);
    console.log(`----------------------------------------------------------------`);

    const tablesToVerify = [
      'roles',
      'permissions',
      'role_permissions',
      'users',
      'organizations',
      'hospitals',
      'clinics',
      'blood_banks',
      'organization_staff',
      'donors',
      'donations',
      'blood_units',
      'system_settings'
    ];

    for (const table of tablesToVerify) {
      const [rows] = await connection.query(`SELECT COUNT(*) AS cnt FROM \`${table}\``);
      const count = rows[0].cnt;
      console.log(`  • ${table.padEnd(22)} : ${count} record(s)`);
    }

    console.log(`----------------------------------------------------------------`);
    console.log(`✨ Database initialization completed successfully!`);
    console.log(`🚀 You can now start the server: npm start`);
    console.log(`🩺 Health check URL: http://localhost:${process.env.PORT || 5000}/api/health/db`);
    console.log(`================================================================\n`);

  } catch (error) {
    console.error(`\n❌ Database Initialization Failed!`);
    console.error(`----------------------------------------------------------------`);
    console.error(`Error Code:    ${error.code || 'UNKNOWN'}`);
    console.error(`Error Message: ${error.message}`);

    if (error.code === 'ECONNREFUSED') {
      console.error(`\n💡 Troubleshooting ECONNREFUSED:`);
      console.error(`  1. Make sure your local MySQL server is currently running.`);
      console.error(`  2. If using MySQL Community Server, start the MySQL service in Windows Services.`);
      console.error(`  3. If using XAMPP, open the XAMPP Control Panel and click 'Start' next to MySQL.`);
      console.error(`  4. Verify that MySQL is listening on port ${DB_PORT}.`);
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error(`\n💡 Troubleshooting ER_ACCESS_DENIED_ERROR:`);
      console.error(`  1. Check the DB_USER ('${DB_USER}') and DB_PASSWORD in your .env file.`);
      console.error(`  2. Ensure the user has permissions to create databases and tables.`);
    }

    console.error(`================================================================\n`);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

run();
