// Socket.IO: authenticated with the same JWT access token as the REST API.
//
// Rooms:   user:<userId>   - personal notifications (every connected user)
//          exam:<examId>   - live monitoring (faculty/admin who own the exam)
// Client -> server:  monitor:join {examId} (ack), monitor:leave {examId}
// Server -> client:  attempt:started | attempt:progress | attempt:submitted  (exam room)
//                    exam:available | result:released                       (user room)
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { corsOptions } = require('../config/cors');
const bus = require('../events/bus');
const User = require('../models/User');
const Exam = require('../models/Exam');
const Attempt = require('../models/Attempt');

let io = null;

function initSockets(httpServer) {
  io = new Server(httpServer, { cors: { origin: corsOptions.origin, methods: ['GET', 'POST'] } });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || (socket.handshake.headers.authorization || '').replace(/^Bearer /, '');
      const payload = jwt.verify(token, env.jwtAccessSecret);
      const user = await User.findById(payload.sub);
      if (!user || !user.isActive) throw new Error('inactive');
      socket.user = user;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user._id}`);

    socket.on('monitor:join', async (payload = {}, ack = () => {}) => {
      try {
        if (!['faculty', 'admin'].includes(socket.user.role)) return ack({ ok: false, message: 'Forbidden' });
        const exam = await Exam.findById(payload.examId);
        if (!exam) return ack({ ok: false, message: 'Exam not found' });
        if (socket.user.role !== 'admin' && !exam.createdBy.equals(socket.user._id)) return ack({ ok: false, message: 'Forbidden' });
        socket.join(`exam:${exam._id}`);
        const live = await Attempt.find({ exam: exam._id, status: 'in_progress' }).populate('student', 'name email');
        ack({
          ok: true,
          active: live.map((a) => ({ attemptId: a._id, student: a.student, startedAt: a.startedAt, deadline: a.deadline,
            answered: a.answers.filter((x) => x.selectedIndex !== null).length, totalQuestions: a.questions.length })),
        });
      } catch {
        ack({ ok: false, message: 'Could not join monitor room' });
      }
    });

    socket.on('monitor:leave', (payload = {}) => payload.examId && socket.leave(`exam:${payload.examId}`));
  });

  // EventEmitter -> Socket.IO bridge
  bus.on('attempt.started', (p) => io.to(`exam:${p.examId}`).emit('attempt:started', p));
  bus.on('attempt.progress', (p) => io.to(`exam:${p.examId}`).emit('attempt:progress', p));
  bus.on('attempt.submitted', (p) => io.to(`exam:${p.examId}`).emit('attempt:submitted', p));
  bus.on('exam.published', (p) => {
    const payload = { examId: p.examId, title: p.title, startTime: p.startTime, endTime: p.endTime };
    (p.recipients || []).forEach((id) => io.to(`user:${id}`).emit('exam:available', payload));
  });
  bus.on('results.released', (p) => {
    (p.recipients || []).forEach((id) => io.to(`user:${id}`).emit('result:released', { examId: p.examId, title: p.title }));
  });

  return io;
}

module.exports = { initSockets };
