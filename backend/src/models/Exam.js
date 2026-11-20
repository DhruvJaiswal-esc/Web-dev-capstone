const mongoose = require('mongoose');
const { Schema } = mongoose;

const examSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    instructions: { type: String, default: '' },
    durationMinutes: { type: Number, required: true, min: 1, max: 600 },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    questions: [{ type: Schema.Types.ObjectId, ref: 'Question' }],
    questionCount: { type: Number, min: 1 }, // pick N random questions from the pool per attempt
    shuffleQuestions: { type: Boolean, default: false },
    negativeMarking: { type: Boolean, default: false },
    maxAttempts: { type: Number, default: 1, min: 1, max: 5 }, // >1 = retakes permitted
    releaseMode: { type: String, enum: ['manual', 'immediate'], default: 'manual' },
    resultsReleasedAt: { type: Date, default: null },
    assignedStudents: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    assignedGroups: [{ type: Schema.Types.ObjectId, ref: 'Group' }],
    status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

examSchema.index({ startTime: 1, endTime: 1 });
examSchema.index({ assignedStudents: 1 });
examSchema.index({ assignedGroups: 1 });
examSchema.pre('validate', function (next) {
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    this.invalidate('endTime', 'endTime must be after startTime');
  }
  if (this.questionCount && this.questionCount > this.questions.length) {
    this.invalidate('questionCount', 'questionCount cannot exceed the number of selected questions');
  }
  next();
});
examSchema.methods.resultsVisible = function () {
  return this.releaseMode === 'immediate' || !!this.resultsReleasedAt;
};

module.exports = mongoose.model('Exam', examSchema);
