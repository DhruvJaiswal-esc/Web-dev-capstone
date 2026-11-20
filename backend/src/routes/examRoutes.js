const router = require('express').Router();
const c = require('../controllers/examController');
const attempts = require('../controllers/attemptController');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');

const staff = authorize('faculty', 'admin');
router.use(authenticate);

// shared: students see assigned+published exams, faculty see their own
router.get('/', validate({ query: v.examList }), c.list);
router.get('/:id', validate({ params: v.idParam }), c.getById);

// student
router.post('/:id/start', authorize('student'), validate({ params: v.idParam }), attempts.start);

// faculty / admin
router.post('/', staff, validate({ body: v.examCreate }), c.create);
router.patch('/:id', staff, validate({ params: v.idParam, body: v.examUpdate }), c.update);
router.delete('/:id', staff, validate({ params: v.idParam }), c.remove);
router.post('/:id/publish', staff, validate({ params: v.idParam }), c.publish);
router.post('/:id/assign', staff, validate({ params: v.idParam, body: v.examAssign }), c.assign);
router.post('/:id/release-results', staff, validate({ params: v.idParam }), c.releaseResults);
router.get('/:id/live', staff, validate({ params: v.idParam }), c.live);

module.exports = router;
