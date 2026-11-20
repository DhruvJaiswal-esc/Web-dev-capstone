const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { signAccess, signRefresh, hashToken } = require('../utils/tokens');

async function issueTokens(user) {
  const accessToken = signAccess(user);
  const refreshToken = signRefresh(user);
  await User.updateOne({ _id: user._id }, { refreshTokenHash: hashToken(refreshToken) });
  return { accessToken, refreshToken };
}

// Public registration always creates a STUDENT. Faculty/admin are created by an admin.
exports.register = asyncHandler(async (req, res) => {
  const user = await User.create({ ...req.body, role: 'student' });
  const tokens = await issueTokens(user);
  res.status(201).json({ success: true, data: { user, ...tokens } });
});

exports.login = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+password');
  if (!user || !(await user.comparePassword(req.body.password))) throw ApiError.unauthorized('Invalid email or password');
  if (!user.isActive) throw ApiError.forbidden('Account is disabled');
  const tokens = await issueTokens(user);
  res.json({ success: true, data: { user, ...tokens } });
});

// Refresh-token rotation: each refresh token works once. Reuse of an old token revokes the session.
exports.refresh = asyncHandler(async (req, res) => {
  const payload = jwt.verify(req.body.refreshToken, env.jwtRefreshSecret);
  const user = await User.findById(payload.sub).select('+refreshTokenHash');
  if (!user || !user.isActive) throw ApiError.unauthorized('Invalid refresh token');
  if (user.refreshTokenHash !== hashToken(req.body.refreshToken)) {
    await User.updateOne({ _id: user._id }, { $unset: { refreshTokenHash: 1 } });
    throw ApiError.unauthorized('Refresh token reuse detected; please log in again');
  }
  const tokens = await issueTokens(user);
  res.json({ success: true, data: tokens });
});

exports.logout = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $unset: { refreshTokenHash: 1 } });
  res.json({ success: true, message: 'Logged out' });
});
