/**
 * ============================================================================
 * BLOOD BANK PLATFORM — VERCEL SERVERLESS API ENTRYPOINT
 * ============================================================================
 *
 * Serves as the serverless function handler for all /api/* routes on Vercel.
 *
 * Execution Modes:
 * 1. Default (Full-Stack Vercel): Executes the Express application directly,
 *    connecting to the MySQL database specified by Vercel environment variables
 *    (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT, DB_SSL, or DATABASE_URL).
 * 2. Proxy (External Backend): If BACKEND_URL or VITE_API_URL is configured with
 *    an external service URL (e.g. Render, Railway), transparently proxies the
 *    API request to that service.
 */

const app = require('../backend/server');

module.exports = async (req, res) => {
  const backendUrl = process.env.BACKEND_URL;
  if (backendUrl && typeof backendUrl === 'string' && !backendUrl.includes('localhost') && !backendUrl.includes('127.0.0.1')) {
    try {
      const cleanBase = backendUrl.replace(/\/+$/, '');
      const targetUrl = `${cleanBase}${req.url}`;

      const headers = { ...req.headers };
      delete headers.host;

      const fetchOptions = {
        method: req.method,
        headers
      };

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body) {
        fetchOptions.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
        headers['content-type'] = headers['content-type'] || 'application/json';
      }

      const proxyRes = await fetch(targetUrl, fetchOptions);
      res.status(proxyRes.status);
      proxyRes.headers.forEach((val, key) => {
        const lowerKey = key.toLowerCase();
        if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(lowerKey)) {
          res.setHeader(key, val);
        }
      });

      const buffer = await proxyRes.arrayBuffer();
      return res.send(Buffer.from(buffer));
    } catch (proxyErr) {
      console.warn('Backend proxy encountered an issue, falling back to local Express handler:', proxyErr.message);
      return app(req, res);
    }
  }

  return app(req, res);
};
