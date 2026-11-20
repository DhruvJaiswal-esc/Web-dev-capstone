const Attempt = require('../models/Attempt');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const bus = require('../events/bus');
const ApiError = require('../utils/ApiError');

const FINAL = ['submitted', 'auto_submitted'];

// Validates incoming answers against THIS attempt's questions and merges them over the saved ones.
async function mergeAnswers(attempt, incoming = []) {
  const allowed = new Set(attempt.questions.map(String));
  const qs = await Question.find({ _id: { $in: attempt.questions } }).select('options');
  const optionCount = new Map(qs.map((q) => [String(q._id), q.options.length]));
  const merged = new Map(attempt.answers.map((a) => [String(a.question), a.selectedIndex]));

  for (const a of incoming) {
    if (!allowed.has(a.questionId)) throw ApiError.badRequest(`Question ${a.questionId} is not part of this examination`);
    if (a.selectedIndex !== null && a.selectedIndex >= optionCount.get(a.questionId)) {
      throw ApiError.badRequest(`Option index ${a.selectedIndex} is out of range for question ${a.questionId}`);
    }
    merged.set(a.questionId, a.selectedIndex);
  }
  return [...merged].map(([question, selectedIndex]) => ({ question, selectedIndex }));
}

// Marks are ALWAYS computed here from the stored answer key; clients never send scores.
// The status filter makes finalisation atomic: a racing second submit gets null.
async function finalizeAttempt(attempt, status, answerOverride) {
  const [questions, exam] = await Promise.all([
    Question.find({ _id: { $in: attempt.questions } }).select('+correctIndex marks negativeMarks'),
    Exam.findById(attempt.exam).select('negativeMarking title'),
  ]);
  const qMap = new Map(questions.map((q) => [String(q._id), q]));
  const source = answerOverride || attempt.answers;
  const saved = new Map(source.map((a) => [String(a.question), a.selectedIndex]));

  let score = 0, correct = 0, wrong = 0;
  const answers = attempt.questions.map((qid) => {
    const q = qMap.get(String(qid));
    const sel = saved.has(String(qid)) ? saved.get(String(qid)) : null;
    let isCorrect = false, awarded = 0;
    if (q && sel !== null && sel !== undefined) {
      if (sel === q.correctIndex) { isCorrect = true; awarded = q.marks; correct++; }
      else { wrong++; if (exam?.negativeMarking) awarded = -(q.negativeMarks || 0); }
    }
    score += awarded;
    return { question: qid, selectedIndex: sel ?? null, isCorrect, marksAwarded: awarded };
  });

  const updated = await Attempt.findOneAndUpdate(
    { _id: attempt._id, status: 'in_progress' },
    { $set: { status, submittedAt: new Date(), answers, score, correctCount: correct, wrongCount: wrong,
              unansweredCount: attempt.questions.length - correct - wrong } },
    { new: true }
  );
  if (updated) {
    bus.emit('attempt.submitted', {
      examId: String(updated.exam), attemptId: String(updated._id), studentId: String(updated.student),
      status: updated.status, submittedAt: updated.submittedAt, title: exam?.title,
    });
  }
  return updated;
}

// Safety net: auto-submit attempts whose deadline passed without a submission.
async function sweepExpired() {
  const expired = await Attempt.find({ status: 'in_progress', deadline: { $lt: new Date() } }).limit(200);
  for (const a of expired) await finalizeAttempt(a, 'auto_submitted');
  return expired.length;
}

module.exports = { FINAL, mergeAnswers, finalizeAttempt, sweepExpired };
