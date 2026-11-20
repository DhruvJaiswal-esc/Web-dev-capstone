const router = require('express').Router();
const c = require('../controllers/attemptController');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('student'));
router.get('/:attemptId', validate({ params: v.attemptIdParam }), c.get);
router.put('/:attemptId/answers', validate({ params: v.attemptIdParam, body: v.saveAnswers }), c.saveAnswers);
router.post('/:attemptId/submit', validate({ params: v.attemptIdParam, body: v.submitAttempt }), c.submit);

module.exports = router;
