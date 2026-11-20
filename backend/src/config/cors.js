const env = require('./env');

// CLIENT_ORIGIN = comma-separated allow-list, e.g. "http://localhost:5173,https://exam.mycollege.edu"
// Use "*" only for quick experiments - never in production.
const allowedOrigins = env.clientOrigin.split(',').map((s) => s.trim()).filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    // No Origin header = non-browser client (Postman, curl, server-to-server): nothing to restrict.
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false); // browser gets no CORS headers and blocks the response
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600, // browsers may cache the preflight for 10 minutes
};

module.exports = { corsOptions, allowedOrigins };
