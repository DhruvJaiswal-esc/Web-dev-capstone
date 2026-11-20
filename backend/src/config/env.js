require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';
const need = (name, fallback) => {
  const v = process.env[name];
  if (v) return v;
  if (isProd) throw new Error(`Missing required env var ${name}`);
  return fallback;
};

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isTest: process.env.NODE_ENV === 'test',
  isProd,
  port: Number(process.env.PORT) || 5000,
  mongoUri: need('MONGO_URI', 'mongodb://127.0.0.1:27017/exam_system'),
  jwtAccessSecret: need('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
  jwtRefreshSecret: need('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
  accessTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTtl: process.env.REFRESH_TOKEN_TTL || '7d',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  submitGraceSeconds: Number(process.env.SUBMIT_GRACE_SECONDS ?? 5),
};
