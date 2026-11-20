const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', index: true },
    attempt: { type: mongoose.Schema.Types.ObjectId, ref: 'Attempt' },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
