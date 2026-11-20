const router = require('express').Router();
const c = require('../controllers/userController');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.get('/me', c.getMe);
router.patch('/me', validate({ body: v.updateMe }), c.updateMe);

// administrator routes
router.use(authorize('admin'));
router.get('/', validate({ query: v.listUsers }), c.list);
router.post('/', validate({ body: v.adminCreateUser }), c.create);
router.get('/:id', validate({ params: v.idParam }), c.getById);
router.patch('/:id', validate({ params: v.idParam, body: v.adminUpdateUser }), c.update);
router.delete('/:id', validate({ params: v.idParam }), c.remove);

module.exports = router;
