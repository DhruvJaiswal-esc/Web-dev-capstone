const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    options: {
      type: [{ type: String, required: true, trim: true }],
      validate: [(v) => v.length >= 2 && v.length <= 6, 'A question needs 2 to 6 options'],
    },
    // Answer key: never selected by default, so it cannot leak through student-facing APIs.
    correctIndex: { type: Number, required: true, min: 0, select: false },
    marks: { type: Number, default: 1, min: 0.01 },
    negativeMarks: { type: Number, default: 0, min: 0 },
    subject: { type: String, trim: true, default: 'General' },
    topic: { type: String, trim: true, required: true },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

questionSchema.index({ topic: 1, difficulty: 1 });
questionSchema.pre('validate', function (next) {
  if (this.correctIndex != null && this.options && this.correctIndex >= this.options.length) {
    this.invalidate('correctIndex', 'correctIndex must point to one of the options');
  }
  next();
});

module.exports = mongoose.model('Question', questionSchema);
