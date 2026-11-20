const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

const signAccess = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, env.jwtAccessSecret, { expiresIn: env.accessTtl });
const signRefresh = (user) =>
  jwt.sign({ sub: String(user._id), jti: crypto.randomUUID() }, env.jwtRefreshSecret, { expiresIn: env.refreshTtl });
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

module.exports = { signAccess, signRefresh, hashToken };
