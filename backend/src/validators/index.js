const { z } = require('zod');

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid id');
const idArray = z.array(objectId).max(1000);
const idParam = z.object({ id: objectId });
const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};
const email = z.string().trim().toLowerCase().email();
const password = z.string().min(8, 'Password must be at least 8 characters').max(72);
const name = z.string().trim().min(2).max(80);

exports.idParam = idParam;
exports.pagination = z.object(pageQuery);

// ---- auth / users ----
exports.register = z.object({ name, email, password });
exports.login = z.object({ email, password: z.string().min(1) });
exports.refresh = z.object({ refreshToken: z.string().min(10) });
exports.updateMe = z.object({
  name: name.optional(),
  currentPassword: z.string().optional(),
  newPassword: password.optional(),
});
exports.adminCreateUser = z.object({
  name, email, password,
  role: z.enum(['admin', 'faculty', 'student']),
  groups: idArray.optional(),
});
exports.adminUpdateUser = z.object({
  name: name.optional(),
  role: z.enum(['admin', 'faculty', 'student']).optional(),
  isActive: z.boolean().optional(),
  groups: idArray.optional(),
});
exports.listUsers = z.object({
  ...pageQuery,
  role: z.enum(['admin', 'faculty', 'student']).optional(),
  search: z.string().trim().max(80).optional(),
});

// ---- groups ----
exports.groupBody = z.object({ name: z.string().trim().min(2).max(80), description: z.string().max(300).optional() });
exports.groupUpdate = exports.groupBody.partial();
exports.groupMembers = z.object({ studentIds: idArray.min(1) });
exports.groupMemberParams = z.object({ id: objectId, userId: objectId });

// ---- questions ----
const questionBase = z.object({
  text: z.string().trim().min(5).max(2000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
  correctIndex: z.number().int().min(0),
  marks: z.number().positive().max(100).default(1),
  negativeMarks: z.number().min(0).max(100).default(0),
  subject: z.string().trim().min(1).max(100).default('General'),
  topic: z.string().trim().min(1).max(100),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
});
exports.questionCreate = questionBase;
exports.questionUpdate = questionBase.partial();
exports.questionList = z.object({
  ...pageQuery,
  topic: z.string().trim().optional(),
  subject: z.string().trim().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

// ---- exams ----
const examBase = z.object({
  title: z.string().trim().min(3).max(200),
  instructions: z.string().max(5000).default(''),
  durationMinutes: z.number().int().min(1).max(600),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  questions: idArray.min(1),
  questionCount: z.number().int().min(1).optional(),
  shuffleQuestions: z.boolean().default(false),
  negativeMarking: z.boolean().default(false),
  maxAttempts: z.number().int().min(1).max(5).default(1),
  releaseMode: z.enum(['manual', 'immediate']).default('manual'),
  assignedStudents: idArray.default([]),
  assignedGroups: idArray.default([]),
});
exports.examCreate = examBase;
exports.examUpdate = examBase.partial();
exports.examList = z.object({
  ...pageQuery,
  status: z.enum(['draft', 'published']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
exports.examAssign = z.object({ studentIds: idArray.default([]), groupIds: idArray.default([]) });

// ---- attempts ----
const answerItem = z.object({ questionId: objectId, selectedIndex: z.number().int().min(0).nullable() });
exports.saveAnswers = z.object({ answers: z.array(answerItem).max(500) });
exports.submitAttempt = z.object({ answers: z.array(answerItem).max(500).optional() });

// ---- reports ----
exports.reportResults = z.object({
  ...pageQuery,
  sortBy: z.enum(['score', 'submittedAt']).default('score'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
exports.reportExams = z.object({
  ...pageQuery,
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
exports.examIdParam = z.object({ examId: objectId });
exports.attemptIdParam = z.object({ attemptId: objectId });
