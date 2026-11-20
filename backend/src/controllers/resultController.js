const Attempt = require('../models/Attempt');
const Question = require('../models/Question');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { meta } = require('../utils/pagination');
const { FINAL } = require('../services/attemptService');

const pct = (s, t) => (t ? Math.round((s / t) * 10000) / 100 : 0);

// GET /api/results/me - scores appear only for exams whose results have been released
exports.myResults = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const filter = { student: req.user._id, status: { $in: FINAL } };
  const [attempts, total] = await Promise.all([
    Attempt.find(filter).populate('exam', 'title releaseMode resultsReleasedAt').sort({ submittedAt: -1 }).skip((page - 1) * limit).limit(limit),
    Attempt.countDocuments(filter),
  ]);
  const data = attempts.map((a) => {
    const visible = a.exam && (a.exam.releaseMode === 'immediate' || a.exam.resultsReleasedAt);
    return {
      attemptId: a._id, examId: a.exam?._id, examTitle: a.exam?.title, status: a.status, submittedAt: a.submittedAt,
      resultsReleased: !!visible,
      ...(visible && {
        score: a.score, totalMarks: a.totalMarks, percentage: pct(a.score, a.totalMarks),
        correct: a.correctCount, wrong: a.wrongCount, unanswered: a.unansweredCount,
      }),
    };
  });
  res.json({ success: true, data, meta: meta(page, limit, total) });
});

// GET /api/results/me/:attemptId - per-question correctness (the answer key itself is never exposed)
exports.myResultDetail = asyncHandler(async (req, res) => {
  const a = await Attempt.findOne({ _id: req.params.attemptId, student: req.user._id, status: { $in: FINAL } }).populate('exam', 'title releaseMode resultsReleasedAt');
  if (!a) throw ApiError.notFound('Result not found');
  if (!(a.exam.releaseMode === 'immediate' || a.exam.resultsReleasedAt)) throw ApiError.forbidden('Results have not been released yet');
  const qs = await Question.find({ _id: { $in: a.questions } }).select('text options topic');
  const map = new Map(qs.map((q) => [String(q._id), q]));
  res.json({
    success: true,
    data: {
      attemptId: a._id, examTitle: a.exam.title, score: a.score, totalMarks: a.totalMarks, percentage: pct(a.score, a.totalMarks),
      correct: a.correctCount, wrong: a.wrongCount, unanswered: a.unansweredCount,
      questions: a.answers.map((x) => ({
        question: map.get(String(x.question)), selectedIndex: x.selectedIndex, isCorrect: x.isCorrect, marksAwarded: x.marksAwarded,
      })),
    },
  });
});
