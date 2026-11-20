const mongoose = require('mongoose');
const { Schema } = mongoose;

const answerSchema = new Schema(
  {
    question: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    selectedIndex: { type: Number, default: null },
    isCorrect: { type: Boolean, default: false },
    marksAwarded: { type: Number, default: 0 },
  },
  { _id: false }
);

const attemptSchema = new Schema(
  {
    exam: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    attemptNumber: { type: Number, default: 1 },
    questions: [{ type: Schema.Types.ObjectId, ref: 'Question' }], // selected + ordered for this attempt
    answers: [answerSchema],
    status: { type: String, enum: ['in_progress', 'submitted', 'auto_submitted'], default: 'in_progress' },
    startedAt: { type: Date, required: true },
    deadline: { type: Date, required: true },
    submittedAt: Date,
    totalMarks: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    wrongCount: { type: Number, default: 0 },
    unansweredCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

attemptSchema.index({ exam: 1, student: 1, attemptNumber: 1 }, { unique: true });
// Only one in-progress attempt per student per exam (guards against double-start races)
attemptSchema.index(
  { exam: 1, student: 1 },
  { unique: true, partialFilterExpression: { status: 'in_progress' }, name: 'one_active_attempt' }
);
attemptSchema.index({ status: 1, deadline: 1 });
attemptSchema.index({ exam: 1, status: 1 });

module.exports = mongoose.model('Attempt', attemptSchema);
