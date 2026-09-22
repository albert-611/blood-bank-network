/**
 * ============================================================================
 * BLOOD BANK PLATFORM — DATABASE CONNECTION POOL (PHASE 2)
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§4 & §9)
 *
 * Configures and exports a reusable MySQL connection pool utilizing mysql2
 * with the Promise-based API. Pool credentials and options are read directly
 * from environment variables.
 */

const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Ensure environment variables are loaded from the project root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'blood_bank_db',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

// Create connection pool with sensible production-ready defaults
const pool = mysql.createPool(dbConfig);

/**
 * Check if local MySQL daemon can be started automatically if offline.
 */
function tryStartLocalMysqlDaemon() {
  const isWindows = process.platform === 'win32';
  if (!isWindows) return false;

  const candidatePaths = [
    {
      exe: 'C:\\xampp\\mysql\\bin\\mysqld.exe',
      cwd: 'C:\\xampp',
      cmd: 'cmd.exe /c cd /d C:\\xampp && mysql\\bin\\mysqld.exe --defaults-file=mysql\\bin\\my.ini --standalone'
    }
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate.exe)) {
      try {
        // Start process via WMI to ensure it runs detached outside the IDE job object
        cp.execSync(`wmic process call create "${candidate.cmd}"`, {
          windowsHide: true,
          stdio: 'ignore'
        });
        return true;
      } catch {
        // Fallback to powershell CIM process creation
        try {
          const psCommand = `Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='${candidate.cmd}'}`;
          cp.execSync(`powershell -NoProfile -Command "${psCommand}"`, {
            windowsHide: true,
            stdio: 'ignore'
          });
          return true;
        } catch {
          return false;
        }
      }
    }
  }

  return false;
}

/**
 * Test connectivity against the database.
 * If connection is refused and running locally, attempts auto-launch of the local server daemon.
 *
 * @returns {Promise<{ host: string, port: number, database: string }>}
 */
async function ensureDatabaseConnection() {
  const isLocalHost = dbConfig.host === 'localhost' || dbConfig.host === '127.0.0.1';

  let lastError = null;

  // First attempt: probe existing pool
  try {
    await pool.query('SELECT 1 AS connection_test');
    return {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database
    };
  } catch (err) {
    lastError = err;
  }

  // If connection refused and host is local, attempt recovery
  if (lastError && lastError.code === 'ECONNREFUSED' && isLocalHost) {
    const started = tryStartLocalMysqlDaemon();
    if (started) {
      // Poll until port 3306 responds
      for (let attempt = 1; attempt <= 15; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        try {
          await pool.query('SELECT 1 AS connection_test');
          return {
            host: dbConfig.host,
            port: dbConfig.port,
            database: dbConfig.database
          };
        } catch (pollErr) {
          lastError = pollErr;
        }
      }
    }
  }

  // If still failed, format clean error message without exposing credentials
  let safeReason = lastError ? lastError.message : 'Unknown connection failure';
  if (lastError && lastError.code === 'ECONNREFUSED') {
    safeReason = `Connection refused at ${dbConfig.host}:${dbConfig.port}. MySQL server is not running.`;
  } else if (lastError && lastError.code === 'ER_BAD_DB_ERROR') {
    safeReason = `Database '${dbConfig.database}' does not exist. Run 'npm run db:init' first.`;
  } else if (lastError && lastError.code === 'ER_ACCESS_DENIED_ERROR') {
    safeReason = `Access denied for user '${dbConfig.user}' at ${dbConfig.host}:${dbConfig.port}.`;
  }

  const err = new Error(safeReason);
  err.code = lastError?.code || 'DB_CONNECTION_FAILED';
  throw err;
}

module.exports = pool;
module.exports.ensureDatabaseConnection = ensureDatabaseConnection;

