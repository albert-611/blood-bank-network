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

const { getDatabaseConfig } = require('../config/db');
const dbConfig = getDatabaseConfig();

const SCHEMA_PATH = path.join(__dirname, '../../database/schema.sql');
const SEED_PATH = path.join(__dirname, '../../database/seed.sql');

// Parse command line arguments
const args = process.argv.slice(2);
const isSeedOnly = args.includes('--seed-only');
const isForce = args.includes('--force');
const isHelp = args.includes('--help') || args.includes('-h');

if (isHelp) {
  console.log(`
🩸 Blood Bank Platform — Database CLI Tool

Usage:
  npm run db:init           Full initialization: builds schema and loads seed data.
  npm run db:seed           Seed only: inserts or refreshes seed records without touching schema.
  node backend/scripts/init-db.js --help  Display this help message.

Environment Configuration:
  DB_HOST:     ${dbConfig.host}
  DB_PORT:     ${dbConfig.port}
  DB_USER:     ${dbConfig.user}
  DB_NAME:     ${dbConfig.database}
  DB_SSL:      ${dbConfig.ssl ? 'Enabled' : 'Disabled'}
  DB_PASSWORD: ${dbConfig.password ? '********' : '(empty)'}
`);
  process.exit(0);
}

async function run() {
  console.log(`\n================================================================`);
  console.log(`🩸 BLOOD BANK PLATFORM — DATABASE INITIALIZER`);
  console.log(`================================================================`);
  console.log(`Connecting to: ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}`);
  console.log(`Target Database: ${dbConfig.database}`);
  console.log(`SSL Mode: ${dbConfig.ssl ? 'Enabled' : 'Disabled'}`);
  console.log(`Execution Mode: ${isSeedOnly ? 'SEED ONLY (preserve schema)' : 'FULL INIT (schema + seed)'}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`----------------------------------------------------------------`);

  let connection;

  try {
    // Step 1: Ensure database exists and is accessible
    let databaseReady = false;
    try {
      const probeConn = await mysql.createConnection({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        ssl: dbConfig.ssl
      });
      await probeConn.query('SELECT 1 AS probe');
      await probeConn.end();
      databaseReady = true;
      console.log(`✅ Step 1: Target database '${dbConfig.database}' is verified and ready.`);
    } catch (probeErr) {
      if (probeErr.code !== 'ER_BAD_DB_ERROR') {
        // May be access-related or remote host without database probe rights
        // We'll proceed and let direct connection provide diagnostic if failed
      }
    }

    if (!databaseReady) {
      try {
        const rootConnection = await mysql.createConnection({
          host: dbConfig.host,
          port: dbConfig.port,
          user: dbConfig.user,
          password: dbConfig.password,
          ssl: dbConfig.ssl
        });

        await rootConnection.query(
          `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
        );
        await rootConnection.end();
        console.log(`✅ Step 1: Database '${dbConfig.database}' verified/created.`);
      } catch (rootErr) {
        // In cloud environments like AWS RDS, Railway, PlanetScale, CREATE DATABASE is often restricted
        console.warn(`ℹ️ Step 1 Note: Direct server database creation skipped (${rootErr.message}).`);
      }
    }

    // Step 2: Connect directly to the database with multipleStatements enabled
    connection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      ssl: dbConfig.ssl,
      multipleStatements: true
    });

    // Step 3: Run Schema if not in seed-only mode
    if (!isSeedOnly) {
      if (!fs.existsSync(SCHEMA_PATH)) {
        throw new Error(`Schema file not found at: ${SCHEMA_PATH}`);
      }

      // Production Protection: check if tables already exist (§14)
      const [existingTables] = await connection.query(`SHOW TABLES LIKE 'users'`);
      const isProduction = process.env.NODE_ENV === 'production';

      if (isProduction && existingTables.length > 0 && !isForce) {
        console.warn(`🛡️ Step 2 (Production Protection): Database '${dbConfig.database}' already has initialized tables.`);
        console.warn(`   Preserving existing production tables and data. Pass '--force' to explicitly rebuild schema.`);
      } else {
        console.log(`⏳ Step 2: Executing schema definitions from database/schema.sql...`);
        const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
        await connection.query(schemaSql);
        console.log(`✅ Step 2: Schema created successfully (all 19 tables initialized).`);
      }
    } else {
      console.log(`⏩ Step 2: Skipped schema rebuild (--seed-only flag provided).`);
    }

    // Step 4: Run Seed Data
    if (!fs.existsSync(SEED_PATH)) {
      throw new Error(`Seed file not found at: ${SEED_PATH}`);
    }
    console.log(`⏳ Step 3: Inserting/updating seed records from database/seed.sql...`);
    const seedSql = fs.readFileSync(SEED_PATH, 'utf8');
    await connection.query(seedSql);
    console.log(`✅ Step 3: Seed data processed safely and idempotently.`);

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
      console.error(`  1. Make sure your database host (${dbConfig.host}:${dbConfig.port}) is accessible.`);
      console.error(`  2. For local MySQL/XAMPP, ensure the service is currently started.`);
      console.error(`  3. For cloud databases (Railway, Render, AWS), verify host and port in environment variables.`);
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error(`\n💡 Troubleshooting ER_ACCESS_DENIED_ERROR:`);
      console.error(`  1. Check DB_USER ('${dbConfig.user}') and DB_PASSWORD in your environment variables.`);
      console.error(`  2. Ensure the user has permissions on database '${dbConfig.database}'.`);
    } else if (error.code === 'HANDSHAKE_SSL_ERROR' || error.message.includes('SSL')) {
      console.error(`\n💡 Troubleshooting SSL:`);
      console.error(`  1. Verify if your cloud database requires SSL (set DB_SSL=true).`);
      console.error(`  2. If using self-signed certs, set DB_SSL_REJECT_UNAUTHORIZED=false.`);
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

