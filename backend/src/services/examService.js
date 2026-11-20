const mongoose = require('mongoose');
const Exam = require('../models/Exam');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');

const uniq = (ids = []) => [...new Set(ids.map(String))];

// Faculty can only touch their own exams; admins can touch any.
async function loadOwnedExam(user, id) {
  const exam = await Exam.findById(id);
  if (!exam) throw ApiError.notFound('Exam not found');
  if (user.role !== 'admin' && !exam.createdBy.equals(user._id)) throw ApiError.forbidden('This exam belongs to another faculty member');
  return exam;
}

function isEligible(exam, user) {
  if (exam.assignedStudents.some((id) => id.equals(user._id))) return true;
  return (user.groups || []).some((g) => exam.assignedGroups.some((eg) => eg.equals(g)));
}

// All student ids who can see this exam (direct + via groups)
async function getRecipientIds(exam) {
  const ids = exam.assignedStudents.map(String);
  if (exam.assignedGroups.length) {
    const members = await User.find({ groups: { $in: exam.assignedGroups }, role: 'student', isActive: true }).distinct('_id');
    ids.push(...members.map(String));
  }
  return uniq(ids);
}

function studentExamView(exam, attempts = []) {
  const o = exam.toObject();
  delete o.questions;
  delete o.assignedStudents;
  delete o.assignedGroups;
  return {
    ...o,
    totalQuestions: exam.questionCount || exam.questions.length,
    myAttempts: attempts.map((a) => ({ _id: a._id, status: a.status, attemptNumber: a.attemptNumber })),
  };
}

const oid = (s) => new mongoose.Types.ObjectId(String(s));

module.exports = { uniq, loadOwnedExam, isEligible, getRecipientIds, studentExamView, oid };
