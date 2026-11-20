const Group = require('../models/Group');
const User = require('../models/User');
const Exam = require('../models/Exam');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { meta } = require('../utils/pagination');

exports.create = asyncHandler(async (req, res) => {
  const group = await Group.create({ ...req.body, createdBy: req.user._id });
  res.status(201).json({ success: true, data: group });
});

exports.list = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const [data, total] = await Promise.all([
    Group.find().sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
    Group.countDocuments(),
  ]);
  res.json({ success: true, data, meta: meta(page, limit, total) });
});

exports.getById = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) throw ApiError.notFound('Group not found');
  const members = await User.find({ groups: group._id }).select('name email role');
  res.json({ success: true, data: { ...group.toObject(), members } });
});

exports.update = asyncHandler(async (req, res) => {
  const group = await Group.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!group) throw ApiError.notFound('Group not found');
  res.json({ success: true, data: group });
});

exports.remove = asyncHandler(async (req, res) => {
  const group = await Group.findByIdAndDelete(req.params.id);
  if (!group) throw ApiError.notFound('Group not found');
  await Promise.all([
    User.updateMany({ groups: group._id }, { $pull: { groups: group._id } }),
    Exam.updateMany({ assignedGroups: group._id }, { $pull: { assignedGroups: group._id } }),
  ]);
  res.json({ success: true, message: 'Group deleted' });
});

exports.addMembers = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) throw ApiError.notFound('Group not found');
  const r = await User.updateMany({ _id: { $in: req.body.studentIds }, role: 'student' }, { $addToSet: { groups: group._id } });
  res.json({ success: true, data: { matched: r.matchedCount, modified: r.modifiedCount } });
});

exports.removeMember = asyncHandler(async (req, res) => {
  const r = await User.updateOne({ _id: req.params.userId }, { $pull: { groups: req.params.id } });
  if (!r.matchedCount) throw ApiError.notFound('User not found');
  res.json({ success: true, message: 'Member removed' });
});
