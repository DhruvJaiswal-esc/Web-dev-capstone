const router = require('express').Router();
const c = require('../controllers/questionController');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('faculty', 'admin'));
router.get('/', validate({ query: v.questionList }), c.list);
router.post('/', validate({ body: v.questionCreate }), c.create);
router.get('/:id', validate({ params: v.idParam }), c.getById);
router.patch('/:id', validate({ params: v.idParam, body: v.questionUpdate }), c.update);
router.delete('/:id', validate({ params: v.idParam }), c.remove);

module.exports = router;
