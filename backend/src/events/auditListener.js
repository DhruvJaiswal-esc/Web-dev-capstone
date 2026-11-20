const bus = require('./bus');
const AuditLog = require('../models/AuditLog');

const EVENTS = ['exam.published', 'attempt.started', 'attempt.submitted', 'results.released'];

module.exports = function registerAuditListener() {
  EVENTS.forEach((event) => {
    bus.on(event, (p) => {
      AuditLog.create({
        action: event,
        actor: p.actorId || p.studentId,
        exam: p.examId,
        attempt: p.attemptId,
        meta: { status: p.status, title: p.title },
      }).catch((e) => console.error('Audit log failed:', e.message));
    });
  });
};
