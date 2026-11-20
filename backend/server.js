const http = require('http');
const env = require('./src/config/env');
const connectDB = require('./src/config/db');
const app = require('./src/app');
const { initSockets } = require('./src/sockets');
const registerAuditListener = require('./src/events/auditListener');
const { sweepExpired } = require('./src/services/attemptService');

(async () => {
  await connectDB();
  registerAuditListener();

  const server = http.createServer(app);
  initSockets(server);

  // Auto-submit attempts that ran out of time without the student submitting
  const sweeper = setInterval(() => sweepExpired().catch((e) => console.error('Sweep failed:', e.message)), 30 * 1000);

  server.listen(env.port, () => console.log(`Server running on port ${env.port} (${env.nodeEnv})`));

  const shutdown = () => { clearInterval(sweeper); server.close(() => process.exit(0)); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
