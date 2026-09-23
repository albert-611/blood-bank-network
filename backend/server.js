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
 */
function validateEnvironment() {
  if (!process.env.JWT_SECRET) {
    console.error('JWT configuration missing.');
    console.error('Reason: JWT_SECRET environment variable is required.');
    process.exit(1);
  }

  const requiredVars = ['PORT', 'DB_HOST', 'DB_USER', 'DB_NAME'];
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      console.error(`Required environment variable missing: ${varName}`);
      process.exit(1);
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

// Restrict Cross-Origin Resource Sharing to known frontend origins (§25)
const configuredOrigin = process.env.CORS_ORIGIN || `http://localhost:${PORT}`;
const allowedOrigins = [
  configuredOrigin,
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  'http://localhost:3000'
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (such as mobile apps, curl, Postman, or local scripts)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked: Origin ${origin} not permitted`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// Parse incoming requests with JSON payloads (capped at 1mb for safety)
app.use(express.json({ limit: '1mb' }));

// Parse incoming URL-encoded form data
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve static frontend assets from the frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

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
    console.error('Database health check failure:', error.message);
    res.status(503).json({
      success: false,
      db: 'disconnected',
      error: {
        message: 'Unable to connect to the MySQL database',
        details: error.message
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
  console.error('Unhandled server error:', err);

  // Handle CORS errors
  if (err.message && err.message.includes('CORS blocked')) {
    return res.status(403).json({
      success: false,
      error: {
        message: err.message,
        code: 'CORS_ERROR'
      }
    });
  }

  // Handle database connection drops or offline state gracefully
  if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST') {
    return res.status(503).json({
      success: false,
      message: 'Database service is currently unavailable. Please verify the database server is running.',
      error: {
        message: 'Database connection failed.',
        code: 'DATABASE_UNAVAILABLE'
      }
    });
  }

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

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = app;
module.exports.startServer = startServer;

