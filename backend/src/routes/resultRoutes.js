const router = require('express').Router();
const c = require('../controllers/resultController');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('student'));
router.get('/me', validate({ query: v.pagination }), c.myResults);
router.get('/me/:attemptId', validate({ params: v.attemptIdParam }), c.myResultDetail);

module.exports = router;
