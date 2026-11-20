const Attempt = require('../models/Attempt');
const Exam = require('../models/Exam');
const asyncHandler = require('../utils/asyncHandler');
const { meta } = require('../utils/pagination');
const { loadOwnedExam } = require('../services/examService');
const { FINAL } = require('../services/attemptService');

const round = (n) => (n == null ? null : Math.round(n * 100) / 100);

// GET /api/reports/exams/:examId/results - student-wise results (paginated, sortable)
exports.studentResults = asyncHandler(async (req, res) => {
  const exam = await loadOwnedExam(req.user, req.params.examId);
  const { page, limit, sortBy, order } = req.query;
  const filter = { exam: exam._id, status: { $in: FINAL } };
  const [data, total] = await Promise.all([
    Attempt.find(filter).select('-questions -answers')
      .populate('student', 'name email')
      .sort({ [sortBy]: order === 'asc' ? 1 : -1 }).skip((page - 1) * limit).limit(limit),
    Attempt.countDocuments(filter),
  ]);
  res.json({ success: true, data, meta: meta(page, limit, total) });
});

// GET /api/reports/exams/:examId/summary - avg / highest / lowest overall and section(group)-wise
exports.summary = asyncHandler(async (req, res) => {
  const exam = await loadOwnedExam(req.user, req.params.examId);
  const match = { $match: { exam: exam._id, status: { $in: FINAL } } };
  const stats = {
    attempts: { $sum: 1 },
    averageScore: { $avg: '$score' },
    highestScore: { $max: '$score' },
    lowestScore: { $min: '$score' },
    averagePercentage: { $avg: { $multiply: [{ $divide: ['$score', { $max: ['$totalMarks', 1] }] }, 100] } },
    autoSubmitted: { $sum: { $cond: [{ $eq: ['$status', 'auto_submitted'] }, 1, 0] } },
  };

  const [overall, bySection, notStarted] = await Promise.all([
    Attempt.aggregate([match, { $group: { _id: null, ...stats } }, { $project: { _id: 0 } }]),
    Attempt.aggregate([
      match,
      { $lookup: { from: 'users', localField: 'student', foreignField: '_id', as: 'u' } },
      { $unwind: '$u' },
      { $unwind: { path: '$u.groups', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$u.groups', ...stats } },
      { $lookup: { from: 'groups', localField: '_id', foreignField: '_id', as: 'g' } },
      { $project: { _id: 0, groupId: '$_id', section: { $ifNull: [{ $arrayElemAt: ['$g.name', 0] }, 'Ungrouped'] },
                    attempts: 1, averageScore: 1, highestScore: 1, lowestScore: 1, averagePercentage: 1 } },
      { $sort: { section: 1 } },
    ]),
    Attempt.countDocuments({ exam: exam._id, status: 'in_progress' }),
  ]);

  const o = overall[0] || { attempts: 0, averageScore: null, highestScore: null, lowestScore: null, averagePercentage: null, autoSubmitted: 0 };
  res.json({
    success: true,
    data: {
      exam: { _id: exam._id, title: exam.title },
      inProgress: notStarted,
      overall: { ...o, averageScore: round(o.averageScore), averagePercentage: round(o.averagePercentage) },
      sectionWise: bySection.map((s) => ({ ...s, averageScore: round(s.averageScore), averagePercentage: round(s.averagePercentage) })),
    },
  });
});

// GET /api/reports/exams/:examId/questions - question-wise performance
exports.questionWise = asyncHandler(async (req, res) => {
  const exam = await loadOwnedExam(req.user, req.params.examId);
  const data = await Attempt.aggregate([
    { $match: { exam: exam._id, status: { $in: FINAL } } },
    { $unwind: '$answers' },
    { $group: {
        _id: '$answers.question',
        appeared: { $sum: 1 },
        attempted: { $sum: { $cond: [{ $ne: ['$answers.selectedIndex', null] }, 1, 0] } },
        correct: { $sum: { $cond: ['$answers.isCorrect', 1, 0] } },
    } },
    { $lookup: { from: 'questions', localField: '_id', foreignField: '_id', as: 'q' } },
    { $unwind: '$q' },
    { $project: {
        _id: 0, questionId: '$_id', text: '$q.text', topic: '$q.topic', difficulty: '$q.difficulty',
        appeared: 1, attempted: 1, correct: 1,
        correctRate: { $round: [{ $multiply: [{ $divide: ['$correct', { $max: ['$appeared', 1] }] }, 100] }, 2] },
    } },
    { $sort: { correctRate: 1 } }, // hardest questions first
  ]);
  res.json({ success: true, data });
});

// GET /api/reports/exams?from=&to= - exam-wise analytics over a date range
exports.examWise = asyncHandler(async (req, res) => {
  const { page, limit, from, to } = req.query;
  const examFilter = req.user.role === 'admin' ? {} : { createdBy: req.user._id };
  if (from || to) examFilter.startTime = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  const examIds = await Exam.find(examFilter).distinct('_id');

  const [data, totalArr] = await Promise.all([
    Attempt.aggregate([
      { $match: { exam: { $in: examIds }, status: { $in: FINAL } } },
      { $group: { _id: '$exam', attempts: { $sum: 1 }, averageScore: { $avg: '$score' }, highestScore: { $max: '$score' }, lowestScore: { $min: '$score' } } },
      { $lookup: { from: 'exams', localField: '_id', foreignField: '_id', as: 'e' } },
      { $unwind: '$e' },
      { $project: { _id: 0, examId: '$_id', title: '$e.title', startTime: '$e.startTime', attempts: 1,
                    averageScore: { $round: ['$averageScore', 2] }, highestScore: 1, lowestScore: 1 } },
      { $sort: { startTime: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]),
    Attempt.aggregate([{ $match: { exam: { $in: examIds }, status: { $in: FINAL } } }, { $group: { _id: '$exam' } }, { $count: 'n' }]),
  ]);
  res.json({ success: true, data, meta: meta(page, limit, totalArr[0]?.n || 0) });
});
