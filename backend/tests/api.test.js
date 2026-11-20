process.env.NODE_ENV = 'test';
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User');
const Group = require('../src/models/Group');
const Question = require('../src/models/Question');
const Exam = require('../src/models/Exam');
const Attempt = require('../src/models/Attempt');

const api = request(app);
let mongod;
let n = 0;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function signup(role = 'student', extra = {}) {
  const email = `${role}${++n}@test.com`;
  await User.create({ name: `${role} ${n}`, email, password: 'Password123', role, ...extra });
  const r = await api.post('/api/auth/login').send({ email, password: 'Password123' });
  return { user: r.body.data.user, token: r.body.data.accessToken, refreshToken: r.body.data.refreshToken };
}

const qBody = (over = {}) => ({
  text: 'What is 2 + 2 ?', options: ['3', '4', '5'], correctIndex: 1, marks: 2, negativeMarks: 1, topic: 'math', ...over,
});

// Builds faculty + student + 2 questions + a published exam (created directly in DB so time windows can be controlled)
async function setup({ examOver = {}, studentExtra = {} } = {}) {
  const faculty = await signup('faculty');
  const student = await signup('student', studentExtra);
  const q1 = await Question.create({ ...qBody(), createdBy: faculty.user._id });
  const q2 = await Question.create({ ...qBody({ text: 'Capital of France ?', options: ['Rome', 'Paris'], correctIndex: 1, topic: 'geo' }), createdBy: faculty.user._id });
  const now = Date.now();
  const exam = await Exam.create({
    title: 'Midterm', durationMinutes: 30, startTime: new Date(now - 10 * 60000), endTime: new Date(now + 60 * 60000),
    questions: [q1._id, q2._id], assignedStudents: [student.user._id], status: 'published', createdBy: faculty.user._id, ...examOver,
  });
  return { faculty, student, q1, q2, exam };
}
const start = (exam, token) => api.post(`/api/exams/${exam._id}/start`).set(auth(token));

describe('Authentication', () => {
  test('register succeeds with valid input and always creates a student', async () => {
    const r = await api.post('/api/auth/register').send({ name: 'Asha', email: 'asha@test.com', password: 'Password123', role: 'admin' });
    expect(r.status).toBe(201);
    expect(r.body.data.user.role).toBe('student');
    expect(r.body.data.user.password).toBeUndefined();
    expect(r.body.data.accessToken).toBeDefined();
  });
  test('register fails with missing / invalid fields', async () => {
    const r = await api.post('/api/auth/register').send({ email: 'bad', password: '123' });
    expect(r.status).toBe(400);
    expect(r.body.details.length).toBeGreaterThan(0);
  });
  test('duplicate email returns 409', async () => {
    const body = { name: 'Asha', email: 'dup@test.com', password: 'Password123' };
    await api.post('/api/auth/register').send(body);
    expect((await api.post('/api/auth/register').send(body)).status).toBe(409);
  });
  test('wrong password returns 401', async () => {
    await signup('student');
    const r = await api.post('/api/auth/login').send({ email: `student${n}@test.com`, password: 'WrongPass123' });
    expect(r.status).toBe(401);
  });
  test('protected route without token returns 401', async () => {
    expect((await api.get('/api/users/me')).status).toBe(401);
  });
  test('refresh rotates tokens and rejects reuse of the old one', async () => {
    const { refreshToken } = await signup('student');
    const r1 = await api.post('/api/auth/refresh').send({ refreshToken });
    expect(r1.status).toBe(200);
    const reuse = await api.post('/api/auth/refresh').send({ refreshToken });
    expect(reuse.status).toBe(401);
  });
  test('logout invalidates the refresh token', async () => {
    const { token, refreshToken } = await signup('student');
    expect((await api.post('/api/auth/logout').set(auth(token))).status).toBe(200);
    expect((await api.post('/api/auth/refresh').send({ refreshToken })).status).toBe(401);
  });
});

describe('RBAC and question bank', () => {
  test('faculty can create a question; response includes the answer key for staff', async () => {
    const f = await signup('faculty');
    const r = await api.post('/api/questions').set(auth(f.token)).send(qBody());
    expect(r.status).toBe(201);
    expect(r.body.data.correctIndex).toBe(1);
  });
  test('student cannot access the question bank (403)', async () => {
    const s = await signup('student');
    expect((await api.get('/api/questions').set(auth(s.token))).status).toBe(403);
    expect((await api.post('/api/questions').set(auth(s.token)).send(qBody())).status).toBe(403);
  });
  test('correctIndex outside the options returns 400', async () => {
    const f = await signup('faculty');
    expect((await api.post('/api/questions').set(auth(f.token)).send(qBody({ correctIndex: 9 }))).status).toBe(400);
  });
  test('unknown question returns 404, malformed id returns 400', async () => {
    const f = await signup('faculty');
    expect((await api.get(`/api/questions/${new mongoose.Types.ObjectId()}`).set(auth(f.token))).status).toBe(404);
    expect((await api.get('/api/questions/not-an-id').set(auth(f.token))).status).toBe(400);
  });
  test('filter by topic/difficulty with pagination; faculty only see their own questions', async () => {
    const f1 = await signup('faculty');
    const f2 = await signup('faculty');
    for (let i = 0; i < 3; i++) await api.post('/api/questions').set(auth(f1.token)).send(qBody({ topic: 'algebra', difficulty: 'hard' }));
    await api.post('/api/questions').set(auth(f1.token)).send(qBody({ topic: 'geo' }));
    await api.post('/api/questions').set(auth(f2.token)).send(qBody({ topic: 'algebra', difficulty: 'hard' }));
    const r = await api.get('/api/questions?topic=algebra&difficulty=hard&limit=2').set(auth(f1.token));
    expect(r.body.data).toHaveLength(2);
    expect(r.body.meta).toMatchObject({ total: 3, pages: 2, limit: 2 });
  });
  test('another faculty cannot edit my question', async () => {
    const f1 = await signup('faculty');
    const f2 = await signup('faculty');
    const q = (await api.post('/api/questions').set(auth(f1.token)).send(qBody())).body.data;
    expect((await api.patch(`/api/questions/${q._id}`).set(auth(f2.token)).send({ marks: 5 })).status).toBe(404);
  });
});

describe('Exam management', () => {
  test('faculty creates, publishes; student sees it; unassigned student does not', async () => {
    const f = await signup('faculty');
    const s = await signup('student');
    const other = await signup('student');
    const q = (await api.post('/api/questions').set(auth(f.token)).send(qBody())).body.data;
    const now = Date.now();
    const created = await api.post('/api/exams').set(auth(f.token)).send({
      title: 'Quiz 1', durationMinutes: 20, startTime: new Date(now - 60000), endTime: new Date(now + 3600000),
      questions: [q._id], assignedStudents: [s.user._id],
    });
    expect(created.status).toBe(201);
    const id = created.body.data._id;
    expect((await api.post(`/api/exams/${id}/publish`).set(auth(f.token))).status).toBe(200);
    expect((await api.post(`/api/exams/${id}/publish`).set(auth(f.token))).status).toBe(409);

    const mine = await api.get('/api/exams').set(auth(s.token));
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].questions).toBeUndefined();
    expect((await api.get('/api/exams').set(auth(other.token))).body.data).toHaveLength(0);
    expect((await api.get(`/api/exams/${id}`).set(auth(other.token))).status).toBe(404);
  });
  test('endTime before startTime returns 400; empty exam cannot be published', async () => {
    const f = await signup('faculty');
    const q = (await api.post('/api/questions').set(auth(f.token)).send(qBody())).body.data;
    const now = Date.now();
    const bad = await api.post('/api/exams').set(auth(f.token)).send({
      title: 'Bad', durationMinutes: 10, startTime: new Date(now + 3600000), endTime: new Date(now), questions: [q._id],
    });
    expect(bad.status).toBe(400);
    const noAssign = await api.post('/api/exams').set(auth(f.token)).send({
      title: 'Nobody', durationMinutes: 10, startTime: new Date(now), endTime: new Date(now + 3600000), questions: [q._id],
    });
    expect((await api.post(`/api/exams/${noAssign.body.data._id}/publish`).set(auth(f.token))).status).toBe(400);
  });
  test('exam can be assigned through a group', async () => {
    const { faculty, exam } = await setup();
    const group = await Group.create({ name: 'CSE-A' });
    const member = await signup('student', { groups: [group._id] });
    await api.post(`/api/exams/${exam._id}/assign`).set(auth(faculty.token)).send({ groupIds: [group._id] });
    expect((await start(exam, member.token)).status).toBe(201);
  });
  test('a question used in a published exam cannot be deleted', async () => {
    const { faculty, q1 } = await setup();
    expect((await api.delete(`/api/questions/${q1._id}`).set(auth(faculty.token))).status).toBe(409);
  });
});

describe('Attempts, security and business rules', () => {
  test('student question API never exposes answer keys', async () => {
    const { student, exam } = await setup();
    const r = await start(exam, student.token);
    expect(r.status).toBe(201);
    expect(r.body.data.questions).toHaveLength(2);
    expect(JSON.stringify(r.body)).not.toMatch(/correctIndex/);
    const again = await api.get(`/api/attempts/${r.body.data._id}`).set(auth(student.token));
    expect(JSON.stringify(again.body)).not.toMatch(/correctIndex/);
  });
  test('student cannot start an exam not assigned to them (403)', async () => {
    const { exam } = await setup();
    const stranger = await signup('student');
    expect((await start(exam, stranger.token)).status).toBe(403);
  });
  test('cannot start before the window opens or after it closes', async () => {
    const now = Date.now();
    const future = await setup({ examOver: { startTime: new Date(now + 3600000), endTime: new Date(now + 7200000) } });
    expect((await start(future.exam, future.student.token)).status).toBe(403);
    const past = await setup({ examOver: { startTime: new Date(now - 7200000), endTime: new Date(now - 3600000) } });
    expect((await start(past.exam, past.student.token)).status).toBe(403);
  });
  test('starting twice resumes the same attempt (no duplicates)', async () => {
    const { student, exam } = await setup();
    const a = await start(exam, student.token);
    const b = await start(exam, student.token);
    expect(b.body.resumed).toBe(true);
    expect(b.body.data._id).toBe(a.body.data._id);
    expect(await Attempt.countDocuments()).toBe(1);
  });
  test('server calculates the score and ignores a client-supplied score', async () => {
    const { student, exam, q1, q2 } = await setup();
    const a = (await start(exam, student.token)).body.data;
    const r = await api.post(`/api/attempts/${a._id}/submit`).set(auth(student.token)).send({
      score: 999, answers: [{ questionId: String(q1._id), selectedIndex: 1 }, { questionId: String(q2._id), selectedIndex: 0 }],
    });
    expect(r.status).toBe(200);
    expect(r.body.data.resultsReleased).toBe(false);
    expect(r.body.data.score).toBeUndefined();
    const stored = await Attempt.findById(a._id);
    expect(stored.score).toBe(2);        // q1 correct (2 marks), q2 wrong (no negative marking)
    expect(stored.correctCount).toBe(1);
    expect(stored.wrongCount).toBe(1);
  });
  test('negative marking is applied when enabled', async () => {
    const { student, exam, q1, q2 } = await setup({ examOver: { negativeMarking: true } });
    const a = (await start(exam, student.token)).body.data;
    await api.post(`/api/attempts/${a._id}/submit`).set(auth(student.token)).send({
      answers: [{ questionId: String(q1._id), selectedIndex: 0 }, { questionId: String(q2._id), selectedIndex: 1 }],
    });
    expect((await Attempt.findById(a._id)).score).toBe(1); // -1 (wrong q1) + 2 (correct q2)
  });
  test('duplicate submission returns 409 and a new attempt is refused', async () => {
    const { student, exam } = await setup();
    const a = (await start(exam, student.token)).body.data;
    expect((await api.post(`/api/attempts/${a._id}/submit`).set(auth(student.token)).send({})).status).toBe(200);
    expect((await api.post(`/api/attempts/${a._id}/submit`).set(auth(student.token)).send({})).status).toBe(409);
    expect((await start(exam, student.token)).status).toBe(409);
  });
  test('retake is allowed when maxAttempts > 1', async () => {
    const { student, exam } = await setup({ examOver: { maxAttempts: 2 } });
    const a = (await start(exam, student.token)).body.data;
    await api.post(`/api/attempts/${a._id}/submit`).set(auth(student.token)).send({});
    expect((await start(exam, student.token)).status).toBe(201);
    const c = await Attempt.findOne({ attemptNumber: 2 });
    expect(c).not.toBeNull();
  });
  test('answers for questions outside the exam are rejected (400)', async () => {
    const { student, exam } = await setup();
    const a = (await start(exam, student.token)).body.data;
    const r = await api.put(`/api/attempts/${a._id}/answers`).set(auth(student.token))
      .send({ answers: [{ questionId: String(new mongoose.Types.ObjectId()), selectedIndex: 0 }] });
    expect(r.status).toBe(400);
  });
  test('option index out of range is rejected (400)', async () => {
    const { student, exam, q2 } = await setup();
    const a = (await start(exam, student.token)).body.data;
    const r = await api.put(`/api/attempts/${a._id}/answers`).set(auth(student.token))
      .send({ answers: [{ questionId: String(q2._id), selectedIndex: 7 }] });
    expect(r.status).toBe(400);
  });
  test('after the deadline the attempt is auto-submitted using only saved answers', async () => {
    const { student, exam, q1, q2 } = await setup();
    const a = (await start(exam, student.token)).body.data;
    await api.put(`/api/attempts/${a._id}/answers`).set(auth(student.token)).send({ answers: [{ questionId: String(q1._id), selectedIndex: 1 }] });
    await Attempt.updateOne({ _id: a._id }, { deadline: new Date(Date.now() - 60000) });
    const r = await api.post(`/api/attempts/${a._id}/submit`).set(auth(student.token))
      .send({ answers: [{ questionId: String(q2._id), selectedIndex: 1 }] }); // late payload must be ignored
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('auto_submitted');
    const stored = await Attempt.findById(a._id);
    expect(stored.score).toBe(2);
    expect(stored.answers.find((x) => String(x.question) === String(q2._id)).selectedIndex).toBeNull();
    expect((await api.put(`/api/attempts/${a._id}/answers`).set(auth(student.token)).send({ answers: [] })).status).toBe(409);
  });
  test("a student cannot read or submit another student's attempt", async () => {
    const { student, exam } = await setup();
    const intruder = await signup('student');
    const a = (await start(exam, student.token)).body.data;
    expect((await api.get(`/api/attempts/${a._id}`).set(auth(intruder.token))).status).toBe(404);
    expect((await api.post(`/api/attempts/${a._id}/submit`).set(auth(intruder.token)).send({})).status).toBe(404);
  });
  test('faculty cannot start an exam (403)', async () => {
    const { faculty, exam } = await setup();
    expect((await start(exam, faculty.token)).status).toBe(403);
  });
});

describe('Results and analytics', () => {
  async function submitAll() {
    const ctx = await setup();
    const g = await Group.create({ name: 'Sec-A' });
    await User.updateOne({ _id: ctx.student.user._id }, { groups: [g._id] });
    const s2 = await signup('student');
    await Exam.updateOne({ _id: ctx.exam._id }, { $addToSet: { assignedStudents: s2.user._id } });
    const a1 = (await start(ctx.exam, ctx.student.token)).body.data;
    await api.post(`/api/attempts/${a1._id}/submit`).set(auth(ctx.student.token)).send({
      answers: [{ questionId: String(ctx.q1._id), selectedIndex: 1 }, { questionId: String(ctx.q2._id), selectedIndex: 1 }],
    }); // 4 / 4
    const a2 = (await start(ctx.exam, s2.token)).body.data;
    await api.post(`/api/attempts/${a2._id}/submit`).set(auth(s2.token)).send({
      answers: [{ questionId: String(ctx.q1._id), selectedIndex: 0 }, { questionId: String(ctx.q2._id), selectedIndex: 1 }],
    }); // 2 / 4
    return { ...ctx, s2, a1, a2 };
  }

  test('students cannot see scores until faculty releases results', async () => {
    const c = await submitAll();
    const list = await api.get('/api/results/me').set(auth(c.student.token));
    expect(list.body.data[0].resultsReleased).toBe(false);
    expect(list.body.data[0].score).toBeUndefined();
    expect((await api.get(`/api/results/me/${c.a1._id}`).set(auth(c.student.token))).status).toBe(403);

    expect((await api.post(`/api/exams/${c.exam._id}/release-results`).set(auth(c.faculty.token))).status).toBe(200);
    const detail = await api.get(`/api/results/me/${c.a1._id}`).set(auth(c.student.token));
    expect(detail.status).toBe(200);
    expect(detail.body.data.score).toBe(4);
    expect(JSON.stringify(detail.body)).not.toMatch(/correctIndex/);
  });
  test('cannot release results while attempts are still in progress', async () => {
    const { faculty, student, exam } = await setup();
    await start(exam, student.token);
    expect((await api.post(`/api/exams/${exam._id}/release-results`).set(auth(faculty.token))).status).toBe(409);
  });
  test('aggregation: summary, section-wise and question-wise analytics', async () => {
    const c = await submitAll();
    const sum = await api.get(`/api/reports/exams/${c.exam._id}/summary`).set(auth(c.faculty.token));
    expect(sum.status).toBe(200);
    expect(sum.body.data.overall).toMatchObject({ attempts: 2, averageScore: 3, highestScore: 4, lowestScore: 2 });
    const secA = sum.body.data.sectionWise.find((s) => s.section === 'Sec-A');
    expect(secA).toMatchObject({ attempts: 1, averageScore: 4 });

    const qw = await api.get(`/api/reports/exams/${c.exam._id}/questions`).set(auth(c.faculty.token));
    const q1 = qw.body.data.find((q) => q.questionId === String(c.q1._id));
    expect(q1).toMatchObject({ appeared: 2, correct: 1, correctRate: 50 });

    const results = await api.get(`/api/reports/exams/${c.exam._id}/results?sortBy=score&order=desc`).set(auth(c.faculty.token));
    expect(results.body.data.map((r) => r.score)).toEqual([4, 2]);
    expect(results.body.meta.total).toBe(2);
  });
  test('exam-wise report supports a date range', async () => {
    const c = await submitAll();
    const from = new Date(Date.now() - 86400000).toISOString();
    const to = new Date(Date.now() + 86400000).toISOString();
    expect((await api.get(`/api/reports/exams?from=${from}&to=${to}`).set(auth(c.faculty.token))).body.data).toHaveLength(1);
    const old = new Date(Date.now() - 10 * 86400000).toISOString();
    expect((await api.get(`/api/reports/exams?from=${old}&to=${from}`).set(auth(c.faculty.token))).body.data).toHaveLength(0);
  });
  test('students cannot access reports; other faculty cannot see my exam reports', async () => {
    const c = await submitAll();
    const other = await signup('faculty');
    expect((await api.get(`/api/reports/exams/${c.exam._id}/summary`).set(auth(c.student.token))).status).toBe(403);
    expect((await api.get(`/api/reports/exams/${c.exam._id}/summary`).set(auth(other.token))).status).toBe(403);
  });
  test('live endpoint lists active attempts for the exam owner', async () => {
    const { faculty, student, exam } = await setup();
    await start(exam, student.token);
    const r = await api.get(`/api/exams/${exam._id}/live`).set(auth(faculty.token));
    expect(r.body.data.activeCount).toBe(1);
  });
});

describe('Admin user management', () => {
  test('admin can create faculty; non-admin cannot list users', async () => {
    const admin = await signup('admin');
    const student = await signup('student');
    const r = await api.post('/api/users').set(auth(admin.token)).send({ name: 'Prof X', email: 'prof@test.com', password: 'Password123', role: 'faculty' });
    expect(r.status).toBe(201);
    expect(r.body.data.role).toBe('faculty');
    expect((await api.get('/api/users').set(auth(student.token))).status).toBe(403);
  });
  test('admin cannot demote or delete themselves', async () => {
    const admin = await signup('admin');
    expect((await api.patch(`/api/users/${admin.user._id}`).set(auth(admin.token)).send({ role: 'student' })).status).toBe(400);
    expect((await api.delete(`/api/users/${admin.user._id}`).set(auth(admin.token))).status).toBe(400);
  });
});

describe('CORS', () => {
  test('allowed origin receives CORS headers', async () => {
    const r = await api.get('/api/health').set('Origin', 'http://localhost:5173');
    expect(r.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
  test('unknown origin receives no CORS headers', async () => {
    const r = await api.get('/api/health').set('Origin', 'http://evil.example');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });
  test('preflight request is answered with allowed methods and headers', async () => {
    const r = await api.options('/api/auth/login').set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(r.status).toBe(204);
    expect(r.headers['access-control-allow-headers']).toMatch(/authorization/i);
  });
});
