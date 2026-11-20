const User = require('../models/User');
const Group = require('../models/Group');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { meta } = require('../utils/pagination');

exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('groups', 'name');
  res.json({ success: true, data: user });
});

exports.updateMe = asyncHandler(async (req, res) => {
  const { name, currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');
  if (name) user.name = name;
  if (newPassword) {
    if (!currentPassword || !(await user.comparePassword(currentPassword))) throw ApiError.badRequest('Current password is incorrect');
    user.password = newPassword;
  }
  await user.save();
  res.json({ success: true, data: user });
});

// ---- admin ----
exports.list = asyncHandler(async (req, res) => {
  const { page, limit, role, search } = req.query;
  const filter = {};
  if (role) filter.role = role;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const [data, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);
  res.json({ success: true, data, meta: meta(page, limit, total) });
});

exports.create = asyncHandler(async (req, res) => {
  if (req.body.groups?.length && (await Group.countDocuments({ _id: { $in: req.body.groups } })) !== new Set(req.body.groups).size) {
    throw ApiError.badRequest('One or more groups do not exist');
  }
  const user = await User.create(req.body);
  res.status(201).json({ success: true, data: user });
});

exports.getById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).populate('groups', 'name');
  if (!user) throw ApiError.notFound('User not found');
  res.json({ success: true, data: user });
});

exports.update = asyncHandler(async (req, res) => {
  if (String(req.user._id) === req.params.id && (req.body.role || req.body.isActive === false)) {
    throw ApiError.badRequest('You cannot change your own role or deactivate yourself');
  }
  const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!user) throw ApiError.notFound('User not found');
  res.json({ success: true, data: user });
});

exports.remove = asyncHandler(async (req, res) => {
  if (String(req.user._id) === req.params.id) throw ApiError.badRequest('You cannot delete yourself');
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  res.json({ success: true, message: 'User deleted' });
});
