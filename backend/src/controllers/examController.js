const Exam = require('../models/Exam');
const Question = require('../models/Question');
const User = require('../models/User');
const Group = require('../models/Group');
const Attempt = require('../models/Attempt');
const bus = require('../events/bus');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { meta } = require('../utils/pagination');
const S = require('../services/examService');

async function assertQuestionsUsable(ids, user) {
  const unique = S.uniq(ids);
  const qs = await Question.find({ _id: { $in: unique } }).select('createdBy');
  if (qs.length !== unique.length) throw ApiError.badRequest('One or more questions do not exist');
  if (user.role !== 'admin' && qs.some((q) => !q.createdBy.equals(user._id))) {
    throw ApiError.forbidden('You can only use questions from your own question bank');
  }
}
async function assertAssignees(studentIds = [], groupIds = []) {
  const s = S.uniq(studentIds), g = S.uniq(groupIds);
  if (s.length && (await User.countDocuments({ _id: { $in: s }, role: 'student' })) !== s.length) {
    throw ApiError.badRequest('assignedStudents must all be existing students');
  }
  if (g.length && (await Group.countDocuments({ _id: { $in: g } })) !== g.length) {
    throw ApiError.badRequest('One or more groups do not exist');
  }
}

exports.create = asyncHandler(async (req, res) => {
  const body = req.body;
  await assertQuestionsUsable(body.questions, req.user);
  await assertAssignees(body.assignedStudents, body.assignedGroups);
  const exam = await Exam.create({
    ...body,
    questions: S.uniq(body.questions),
    assignedStudents: S.uniq(body.assignedStudents),
    assignedGroups: S.uniq(body.assignedGroups),
    createdBy: req.user._id,
  });
  res.status(201).json({ success: true, data: exam });
});

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, status, from, to } = req.query;
  const skip = (page - 1) * limit;

  if (req.user.role === 'student') {
    const filter = {
      status: 'published',
      $or: [{ assignedStudents: req.user._id }, { assignedGroups: { $in: req.user.groups } }],
    };
    if (from || to) filter.startTime = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
    const [exams, total] = await Promise.all([
      Exam.find(filter).sort({ startTime: 1 }).skip(skip).limit(limit),
      Exam.countDocuments(filter),
    ]);
    const attempts = await Attempt.find({ student: req.user._id, exam: { $in: exams.map((e) => e._id) } }).select('exam status attemptNumber');
    const byExam = new Map();
    attempts.forEach((a) => byExam.set(String(a.exam), [...(byExam.get(String(a.exam)) || []), a]));
    const data = exams.map((e) => S.studentExamView(e, byExam.get(String(e._id)) || []));
    return res.json({ success: true, data, meta: meta(page, limit, total) });
  }

  const filter = req.user.role === 'admin' ? {} : { createdBy: req.user._id };
  if (status) filter.status = status;
  if (from || to) filter.startTime = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  const [data, total] = await Promise.all([
    Exam.find(filter).sort({ startTime: -1 }).skip(skip).limit(limit),
    Exam.countDocuments(filter),
  ]);
  res.json({ success: true, data, meta: meta(page, limit, total) });
});

exports.getById = asyncHandler(async (req, res) => {
  if (req.user.role === 'student') {
    const exam = await Exam.findById(req.params.id);
    // Same 404 for "missing" and "not assigned" so students cannot probe for exam ids.
    if (!exam || exam.status !== 'published' || !S.isEligible(exam, req.user)) throw ApiError.notFound('Exam not found');
    const attempts = await Attempt.find({ exam: exam._id, student: req.user._id }).select('status attemptNumber');
    return res.json({ success: true, data: S.studentExamView(exam, attempts) });
  }
  const exam = await S.loadOwnedExam(req.user, req.params.id);
  res.json({ success: true, data: exam });
});

exports.update = asyncHandler(async (req, res) => {
  const exam = await S.loadOwnedExam(req.user, req.params.id);
  if (exam.status !== 'draft') throw ApiError.conflict('Only draft examinations can be edited');
  if (req.body.questions) await assertQuestionsUsable(req.body.questions, req.user);
  await assertAssignees(req.body.assignedStudents, req.body.assignedGroups);
  exam.set(req.body);
  await exam.save();
  res.json({ success: true, data: exam });
});

exports.remove = asyncHandler(async (req, res) => {
  const exam = await S.loadOwnedExam(req.user, req.params.id);
  if (await Attempt.exists({ exam: exam._id })) throw ApiError.conflict('Cannot delete an examination that has attempts');
  await exam.deleteOne();
  res.json({ success: true, message: 'Exam deleted' });
});

exports.publish = asyncHandler(async (req, res) => {
  const exam = await S.loadOwnedExam(req.user, req.params.id);
  if (exam.status === 'published') throw ApiError.conflict('Exam is already published');
  if (!exam.questions.length) throw ApiError.badRequest('Add at least one question before publishing');
  if (!exam.assignedStudents.length && !exam.assignedGroups.length) throw ApiError.badRequest('Assign the exam to students or groups before publishing');
  if (exam.endTime <= new Date()) throw ApiError.badRequest('endTime is already in the past');
  exam.status = 'published';
  await exam.save();
  bus.emit('exam.published', {
    examId: String(exam._id), title: exam.title, startTime: exam.startTime, endTime: exam.endTime,
    actorId: String(req.user._id), recipients: await S.getRecipientIds(exam),
  });
  res.json({ success: true, data: exam });
});

exports.assign = asyncHandler(async (req, res) => {
  const exam = await S.loadOwnedExam(req.user, req.params.id);
  const { studentIds, groupIds } = req.body;
  if (!studentIds.length && !groupIds.length) throw ApiError.badRequest('Provide studentIds and/or groupIds');
  if (exam.endTime <= new Date()) throw ApiError.conflict('Exam has already ended');
  await assertAssignees(studentIds, groupIds);
  await Exam.updateOne({ _id: exam._id }, { $addToSet: { assignedStudents: { $each: S.uniq(studentIds) }, assignedGroups: { $each: S.uniq(groupIds) } } });
  const fresh = await Exam.findById(exam._id);
  if (fresh.status === 'published') {
    const added = { assignedStudents: S.uniq(studentIds).map((id) => S.oid(id)), assignedGroups: S.uniq(groupIds).map((id) => S.oid(id)) };
    bus.emit('exam.published', {
      examId: String(exam._id), title: exam.title, startTime: exam.startTime, endTime: exam.endTime,
      actorId: String(req.user._id), recipients: await S.getRecipientIds(added),
    });
  }
  res.json({ success: true, data: fresh });
});

exports.releaseResults = asyncHandler(async (req, res) => {
  const exam = await S.loadOwnedExam(req.user, req.params.id);
  if (exam.status !== 'published') throw ApiError.conflict('Exam is not published');
  if (await Attempt.exists({ exam: exam._id, status: 'in_progress' })) {
    throw ApiError.conflict('Some attempts are still in progress; release results after they finish');
  }
  exam.resultsReleasedAt = new Date();
  await exam.save();
  const students = await Attempt.find({ exam: exam._id }).distinct('student');
  bus.emit('results.released', { examId: String(exam._id), title: exam.title, actorId: String(req.user._id), recipients: students.map(String) });
  res.json({ success: true, data: exam });
});

// Live snapshot of in-progress attempts (REST counterpart of the Socket.IO monitor).
exports.live = asyncHandler(async (req, res) => {
  const exam = await S.loadOwnedExam(req.user, req.params.id);
  const [active, submitted] = await Promise.all([
    Attempt.find({ exam: exam._id, status: 'in_progress' }).populate('student', 'name email'),
    Attempt.countDocuments({ exam: exam._id, status: { $in: ['submitted', 'auto_submitted'] } }),
  ]);
  res.json({
    success: true,
    data: {
      submittedCount: submitted,
      activeCount: active.length,
      active: active.map((a) => ({
        attemptId: a._id, student: a.student, startedAt: a.startedAt, deadline: a.deadline,
        answered: a.answers.filter((x) => x.selectedIndex !== null).length, totalQuestions: a.questions.length,
      })),
    },
  });
});
