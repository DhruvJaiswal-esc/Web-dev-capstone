const Exam = require('../models/Exam');
const Attempt = require('../models/Attempt');
const Question = require('../models/Question');
const bus = require('../events/bus');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { isEligible } = require('../services/examService');
const { FINAL, mergeAnswers, finalizeAttempt } = require('../services/attemptService');

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Student-facing view: question text/options only. correctIndex is `select:false` and never loaded here.
async function studentAttemptView(attempt) {
  const qs = await Question.find({ _id: { $in: attempt.questions } }).select('text options marks subject topic');
  const map = new Map(qs.map((q) => [String(q._id), q]));
  return {
    _id: attempt._id,
    exam: attempt.exam,
    status: attempt.status,
    startedAt: attempt.startedAt,
    deadline: attempt.deadline,
    remainingSeconds: Math.max(0, Math.floor((attempt.deadline - Date.now()) / 1000)),
    totalMarks: attempt.totalMarks,
    questions: attempt.questions.map((id) => map.get(String(id))).filter(Boolean),
    answers: attempt.answers.map((a) => ({ questionId: a.question, selectedIndex: a.selectedIndex })),
  };
}

async function loadOwnAttempt(req) {
  const attempt = await Attempt.findOne({ _id: req.params.attemptId, student: req.user._id });
  if (!attempt) throw ApiError.notFound('Attempt not found');
  return attempt;
}

// POST /api/exams/:id/start
exports.start = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam || exam.status !== 'published' || !isEligible(exam, req.user)) {
    throw ApiError.forbidden('This examination is not assigned to you');
  }
  const now = new Date();
  if (now < exam.startTime) throw ApiError.forbidden('This examination has not started yet');
  if (now > exam.endTime) throw ApiError.forbidden('This examination has ended');

  // Resume an in-progress attempt instead of creating a second one
  const active = await Attempt.findOne({ exam: exam._id, student: req.user._id, status: 'in_progress' });
  if (active) {
    if (active.deadline > now) return res.json({ success: true, data: await studentAttemptView(active), resumed: true });
    await finalizeAttempt(active, 'auto_submitted');
  }

  const used = await Attempt.countDocuments({ exam: exam._id, student: req.user._id });
  if (used >= exam.maxAttempts) throw ApiError.conflict('You have already submitted this examination');

  let ids = exam.questions.map(String);
  if (exam.questionCount && exam.questionCount < ids.length) ids = shuffle(ids).slice(0, exam.questionCount);
  if (exam.shuffleQuestions) ids = shuffle(ids);

  const qs = await Question.find({ _id: { $in: ids } }).select('marks');
  const totalMarks = qs.reduce((sum, q) => sum + q.marks, 0);
  const deadline = new Date(Math.min(now.getTime() + exam.durationMinutes * 60000, exam.endTime.getTime()));

  const attempt = await Attempt.create({
    exam: exam._id, student: req.user._id, attemptNumber: used + 1,
    questions: ids, startedAt: now, deadline, totalMarks,
  });
  bus.emit('attempt.started', {
    examId: String(exam._id), attemptId: String(attempt._id), studentId: String(req.user._id),
    studentName: req.user.name, startedAt: attempt.startedAt, deadline, totalQuestions: ids.length,
  });
  res.status(201).json({ success: true, data: await studentAttemptView(attempt) });
});

exports.get = asyncHandler(async (req, res) => {
  let attempt = await loadOwnAttempt(req);
  if (attempt.status === 'in_progress' && attempt.deadline < new Date()) {
    attempt = (await finalizeAttempt(attempt, 'auto_submitted')) || (await Attempt.findById(attempt._id));
  }
  res.json({ success: true, data: await studentAttemptView(attempt) });
});

// PUT /api/attempts/:attemptId/answers  - autosave progress
exports.saveAnswers = asyncHandler(async (req, res) => {
  const attempt = await loadOwnAttempt(req);
  if (attempt.status !== 'in_progress') throw ApiError.conflict('This attempt has already been submitted');
  if (attempt.deadline < new Date()) {
    await finalizeAttempt(attempt, 'auto_submitted');
    throw ApiError.conflict('Time is up; your attempt was auto-submitted with the answers saved so far');
  }
  const merged = await mergeAnswers(attempt, req.body.answers);
  const updated = await Attempt.findOneAndUpdate(
    { _id: attempt._id, status: 'in_progress', deadline: { $gt: new Date() } },
    { $set: { answers: merged } },
    { new: true }
  );
  if (!updated) throw ApiError.conflict('This attempt is no longer open');
  const answered = merged.filter((a) => a.selectedIndex !== null).length;
  bus.emit('attempt.progress', {
    examId: String(attempt.exam), attemptId: String(attempt._id), studentId: String(req.user._id),
    answered, totalQuestions: attempt.questions.length,
  });
  res.json({ success: true, data: { answered, remainingSeconds: Math.max(0, Math.floor((attempt.deadline - Date.now()) / 1000)) } });
});

// POST /api/attempts/:attemptId/submit
exports.submit = asyncHandler(async (req, res) => {
  const attempt = await loadOwnAttempt(req);
  if (FINAL.includes(attempt.status)) throw ApiError.conflict('This examination has already been submitted');

  const exam = await Exam.findById(attempt.exam);
  const late = Date.now() > attempt.deadline.getTime() + env.submitGraceSeconds * 1000;

  let finalAttempt;
  if (late) {
    // Past the deadline: ignore the payload and grade only what was autosaved in time.
    finalAttempt = await finalizeAttempt(attempt, 'auto_submitted');
  } else {
    const merged = await mergeAnswers(attempt, req.body.answers);
    finalAttempt = await finalizeAttempt(attempt, 'submitted', merged);
  }
  if (!finalAttempt) throw ApiError.conflict('This examination has already been submitted');

  const visible = exam.resultsVisible();
  res.json({
    success: true,
    message: late ? 'Deadline passed: attempt auto-submitted with previously saved answers' : 'Examination submitted',
    data: {
      attemptId: finalAttempt._id, status: finalAttempt.status, submittedAt: finalAttempt.submittedAt, resultsReleased: visible,
      ...(visible && { score: finalAttempt.score, totalMarks: finalAttempt.totalMarks }),
    },
  });
});
