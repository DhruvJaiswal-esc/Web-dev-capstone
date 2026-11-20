const Question = require('../models/Question');
const Exam = require('../models/Exam');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { meta } = require('../utils/pagination');

const scope = (user) => (user.role === 'admin' ? {} : { createdBy: user._id });

async function loadOwned(user, id) {
  const q = await Question.findOne({ _id: id, ...scope(user) }).select('+correctIndex');
  if (!q) throw ApiError.notFound('Question not found');
  return q;
}
async function assertNotInPublishedExam(id) {
  if (await Exam.exists({ questions: id, status: 'published' })) {
    throw ApiError.conflict('This question is used in a published examination and cannot be changed or deleted');
  }
}

exports.create = asyncHandler(async (req, res) => {
  const q = await Question.create({ ...req.body, createdBy: req.user._id });
  const out = await Question.findById(q._id).select('+correctIndex');
  res.status(201).json({ success: true, data: out });
});

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, topic, subject, difficulty } = req.query;
  const filter = { ...scope(req.user) };
  if (topic) filter.topic = topic;
  if (subject) filter.subject = subject;
  if (difficulty) filter.difficulty = difficulty;
  const [data, total] = await Promise.all([
    Question.find(filter).select('+correctIndex').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Question.countDocuments(filter),
  ]);
  res.json({ success: true, data, meta: meta(page, limit, total) });
});

exports.getById = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await loadOwned(req.user, req.params.id) });
});

exports.update = asyncHandler(async (req, res) => {
  const q = await loadOwned(req.user, req.params.id);
  await assertNotInPublishedExam(q._id);
  q.set(req.body);
  await q.save(); // runs model validators (e.g. correctIndex within options)
  res.json({ success: true, data: q });
});

exports.remove = asyncHandler(async (req, res) => {
  const q = await loadOwned(req.user, req.params.id);
  await assertNotInPublishedExam(q._id);
  await q.deleteOne();
  res.json({ success: true, message: 'Question deleted' });
});
