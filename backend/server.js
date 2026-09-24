/**
 * ============================================================================
 * BLOOD BANK PLATFORM — BACKEND SERVER ENTRYPOINT
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§12, §18, §25)
 *
 * Boots Express server, mounts security headers (helmet), CORS, request parsers,
 * static frontend assets, authentication routes (/api/auth), and centralized
 * error handling.
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');

// Load environment variables from repository root .env file using absolute path
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Import database connection pool & connectivity verifier
const db = require('./config/db');
const { ensureDatabaseConnection } = require('./config/db');

// Import route handlers
const authRoutes = require('./routes/authRoutes');
const organizationRoutes = require('./routes/organizationRoutes');
const { hospitalRouter, clinicRouter, bloodBankRouter } = require('./routes/specializedRoutes');
const staffRoutes = require('./routes/staffRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const publicRoutes = require('./routes/publicRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');

// Initialize the Express application
const app = express();
const PORT = parseInt(process.env.PORT, 10) || 5000;

/**
 * Validates presence of critical environment variables.
 * Fails fast with safe error messages without leaking secret values.
 * Supports both discrete DB_* variables and DATABASE_URL / MYSQL_URL.
 */
function validateEnvironment() {
  if (!process.env.JWT_SECRET) {
    console.error('JWT configuration missing.');
    console.error('Reason: JWT_SECRET environment variable is required.');
    process.exit(1);
  }

  const hasDbUrl = Boolean(process.env.DATABASE_URL || process.env.MYSQL_URL);
  if (!hasDbUrl) {
    const requiredVars = ['DB_HOST', 'DB_USER', 'DB_NAME'];
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        console.error(`Required environment variable missing: ${varName}`);
        process.exit(1);
      }
    }
  }
}

// ============================================================================
// SECURITY & FOUNDATIONAL MIDDLEWARE (§25)
// ============================================================================

// Secure HTTP Headers via Helmet (CSP disabled to allow Tailwind CDN & local scripts in MVP)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

// ============================================================================
// CORS CONFIGURATION (§17 & §25)
// ============================================================================
// Allowed origins include the production Vercel frontend, local development hosts,
// and any origins dynamically configured via FRONTEND_URL, CORS_ORIGIN, CLIENT_URL,
// or FRONTEND_ORIGIN environment variables.
function getAllowedOrigins() {
  const origins = new Set([
    // Production Deployed Vercel Frontend (exact origin, no trailing slash)
    'https://blood-bank-network.vercel.app',

    // Local Development Origins
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
  ]);

  const envOrigins = [
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGIN,
    process.env.CLIENT_URL,
    process.env.FRONTEND_ORIGIN
  ];

  if (process.env.VERCEL_URL) {
    envOrigins.push(`https://${process.env.VERCEL_URL}`);
  }

  for (const raw of envOrigins) {
    if (raw && typeof raw === 'string') {
      raw.split(',').forEach((o) => {
        const trimmed = o.trim().replace(/\/+$/, '');
        if (trimmed) origins.add(trimmed);
      });
    }
  }

  return Array.from(origins);
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (such as mobile apps, curl, Postman, or server-to-server)
    if (!origin) return callback(null, true);
    const allowed = getAllowedOrigins();
    const normalizedOrigin = origin.replace(/\/+$/, '');
    if (allowed.includes(normalizedOrigin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked: Origin ${origin} not permitted`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // Cache preflight response for 24 hours (86400 seconds)
};

// Mount CORS middleware for all incoming requests and preflight OPTIONS
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Parse incoming requests with JSON payloads (capped at 1mb for safety)
app.use(express.json({ limit: '1mb' }));

// Parse incoming URL-encoded form data
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve static frontend assets from the frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/demo', express.static(path.join(__dirname, '../demo')));

// ============================================================================
// API ROUTES
// ============================================================================

/**
 * @route   GET /api/health
 * @desc    System health check and diagnostic endpoint
 * @access  Public
 */
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

/**
 * @route   GET /api/health/db
 * @desc    Database connectivity check and query verification
 * @access  Public
 */
app.get('/api/health/db', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 AS alive');
    res.status(200).json({
      success: true,
      db: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Health Check] Database connectivity check failure:', error.code || 'UNKNOWN', error.message);
    res.status(503).json({
      success: false,
      db: 'disconnected',
      error: {
        message: 'Database connection failed.',
        code: error.code || 'DATABASE_UNAVAILABLE'
      }
    });
  }
});

// Mount Authentication & User Routes (§12 & §18)
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Mount Organization Routes (§11 & §18)
app.use('/api/organizations', organizationRoutes);
app.use('/api/organization/staff', staffRoutes);
app.use('/api/organization', organizationRoutes);

// Mount Specialized Organization Routes (§16 & §18)
app.use('/api/hospitals', hospitalRouter);
app.use('/api/clinics', clinicRouter);
app.use('/api/blood-banks', bloodBankRouter);

// Mount Inventory & Blood Units Routes (§9 & §11)
app.use('/api/inventory', inventoryRoutes);
app.use('/api/blood-units', inventoryRoutes);

// Mount Public Discovery Routes (§8 & §18)
app.use('/api/public', publicRoutes);

// Mount Platform Super Admin Routes (§5, §11, §13)
app.use('/api/admin', adminRoutes);

// ============================================================================
// ERROR HANDLING & FALLBACKS (§18 & §25)
// ============================================================================

// 404 Handler for undefined API routes
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `API route not found: ${req.method} ${req.originalUrl}`,
      code: 'NOT_FOUND'
    }
  });
});

// Centralized Error Handler (Never leak stack traces or raw SQL queries to clients)
app.use((err, req, res, next) => {
  // Handle CORS errors cleanly without noisy unhandled logs
  if (err.message && err.message.includes('CORS blocked')) {
    return res.status(403).json({
      success: false,
      error: {
        message: err.message,
        code: 'CORS_ERROR'
      }
    });
  }

  // Handle database connection drops or offline state gracefully (§18 & §25)
  const isDbConnectionError = [
    'ECONNREFUSED',
    'PROTOCOL_CONNECTION_LOST',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EHOSTUNREACH',
    'ER_ACCESS_DENIED_ERROR',
    'ER_BAD_DB_ERROR',
    'HANDSHAKE_SSL_ERROR',
    'DB_CONNECTION_FAILED'
  ].includes(err.code);

  if (isDbConnectionError) {
    console.error(`[Database Error] Connection failed (${err.code}):`, err.message);
    return res.status(503).json({
      success: false,
      message: 'Database service is currently unavailable. Please verify the database server is running.',
      error: {
        message: 'Database connection failed.',
        code: 'DATABASE_UNAVAILABLE'
      }
    });
  }

  console.error('Unhandled server error:', err);

  // Handle MySQL duplicate key collisions gracefully
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      success: false,
      error: {
        message: 'A record with this identifier or unique attribute already exists.',
        code: 'CONFLICT'
      }
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  const errorMessage = statusCode === 500 && isProduction
    ? 'Internal Server Error'
    : err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message: errorMessage,
    error: {
      message: errorMessage,
      code: err.code || 'INTERNAL_ERROR'
    }
  });
});

// ============================================================================
// SERVER INITIALIZATION
// ============================================================================

async function startServer() {
  console.log('Starting BloodLink API...\n');

  // Step 1: Validate Environment
  validateEnvironment();
  console.log('Environment loaded');

  // Step 2: Connect & Verify Database
  console.log('Connecting to MySQL...');
  let dbInfo;
  try {
    dbInfo = await ensureDatabaseConnection();
    console.log('MySQL connected successfully');
    console.log(`Database: ${dbInfo.database}`);
  } catch (dbErr) {
    console.error('\nMySQL connection failed.');
    console.error(`Reason: ${dbErr.message || 'Unable to establish connection to database'}\n`);
    process.exit(1);
  }

  // Step 3: Start Express Server & Accept API Requests
  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log('Authentication routes loaded\n');
      console.log(`====================================================`);
      console.log(`🩸 Blood Bank Platform Backend Server Running`);
      console.log(`📡 URL: http://localhost:${PORT}`);
      console.log(`🩺 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🗄️ Database health: http://localhost:${PORT}/api/health/db`);
      console.log(`🔐 Auth API: http://localhost:${PORT}/api/auth`);
      console.log(`====================================================\n`);
      resolve(server);
    });
  });
}

// Start HTTP listener only when executed directly (node backend/server.js)
// When imported as a module (e.g. Vercel Serverless Function or test runner), export app without listening
if (require.main === module && process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = app;
module.exports.startServer = startServer;

