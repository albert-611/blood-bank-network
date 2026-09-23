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

/**
 * Resolves database configuration from environment variables.
 * Supports individual variables (DB_HOST, DB_USER, etc.) and connection strings (DATABASE_URL / MYSQL_URL).
 * Also configures SSL if DB_SSL is enabled or required by the cloud provider.
 */
function getDatabaseConfig() {
  const connectionUri = process.env.DATABASE_URL || process.env.MYSQL_URL;

  let host = process.env.DB_HOST || 'localhost';
  let user = process.env.DB_USER || 'root';
  let password = process.env.DB_PASSWORD || '';
  let database = process.env.DB_NAME || 'blood_bank_db';
  let port = parseInt(process.env.DB_PORT, 10) || 3306;
  let isSsl = process.env.DB_SSL === 'true';

  if (connectionUri) {
    try {
      const parsed = new URL(connectionUri);
      host = parsed.hostname || host;
      port = parseInt(parsed.port, 10) || port;
      user = decodeURIComponent(parsed.username || user);
      password = decodeURIComponent(parsed.password || password);
      const parsedDb = parsed.pathname.replace(/^\//, '');
      if (parsedDb) {
        database = parsedDb;
      }
      if (parsed.searchParams.get('ssl') === 'true' || parsed.searchParams.get('sslmode') === 'require') {
        isSsl = true;
      }
    } catch (parseErr) {
      console.warn('⚠️ Unable to parse DATABASE_URL as URL, falling back to individual parameters:', parseErr.message);
    }
  }

  const sslConfig = isSsl
    ? {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
      }
    : undefined;

  return {
    host,
    user,
    password,
    database,
    port,
    ssl: sslConfig,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  };
}

const dbConfig = getDatabaseConfig();

// Create connection pool with sensible production-ready defaults
const pool = mysql.createPool(dbConfig);

/**
 * Check if local MySQL daemon can be started automatically if offline.
 * Strictly disabled in production or when connecting to remote databases.
 */
function tryStartLocalMysqlDaemon() {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) return false;

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
 * If connection is refused and running locally in development, attempts auto-launch of the local server daemon.
 *
 * @returns {Promise<{ host: string, port: number, database: string }>}
 */
async function ensureDatabaseConnection() {
  const currentConfig = getDatabaseConfig();
  const isLocalHost = currentConfig.host === 'localhost' || currentConfig.host === '127.0.0.1';
  const isProduction = process.env.NODE_ENV === 'production';

  let lastError = null;

  // First attempt: probe existing pool
  try {
    await pool.query('SELECT 1 AS connection_test');
    return {
      host: currentConfig.host,
      port: currentConfig.port,
      database: currentConfig.database
    };
  } catch (err) {
    lastError = err;
  }

  // If connection refused, host is local, and NOT in production, attempt recovery
  if (lastError && lastError.code === 'ECONNREFUSED' && isLocalHost && !isProduction) {
    const started = tryStartLocalMysqlDaemon();
    if (started) {
      // Poll until port responds
      for (let attempt = 1; attempt <= 15; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        try {
          await pool.query('SELECT 1 AS connection_test');
          return {
            host: currentConfig.host,
            port: currentConfig.port,
            database: currentConfig.database
          };
        } catch (pollErr) {
          lastError = pollErr;
        }
      }
    }
  }

  // Format clean error message without exposing credentials
  let safeReason = lastError ? lastError.message : 'Unknown connection failure';
  if (lastError && lastError.code === 'ECONNREFUSED') {
    safeReason = `Connection refused at ${currentConfig.host}:${currentConfig.port}. MySQL server is not reachable.`;
  } else if (lastError && lastError.code === 'ER_BAD_DB_ERROR') {
    safeReason = `Database '${currentConfig.database}' does not exist. Run 'npm run db:init' first.`;
  } else if (lastError && lastError.code === 'ER_ACCESS_DENIED_ERROR') {
    safeReason = `Access denied for database user at ${currentConfig.host}:${currentConfig.port}. Check credentials.`;
  }

  const err = new Error(safeReason);
  err.code = lastError?.code || 'DB_CONNECTION_FAILED';
  throw err;
}

module.exports = pool;
module.exports.ensureDatabaseConnection = ensureDatabaseConnection;
module.exports.getDatabaseConfig = getDatabaseConfig;


