const router = require('express').Router();
const c = require('../controllers/reportController');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('faculty', 'admin'));
router.get('/exams', validate({ query: v.reportExams }), c.examWise);
router.get('/exams/:examId/results', validate({ params: v.examIdParam, query: v.reportResults }), c.studentResults);
router.get('/exams/:examId/summary', validate({ params: v.examIdParam }), c.summary);
router.get('/exams/:examId/questions', validate({ params: v.examIdParam }), c.questionWise);

module.exports = router;
