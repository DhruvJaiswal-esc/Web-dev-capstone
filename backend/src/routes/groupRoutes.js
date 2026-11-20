const router = require('express').Router();
const c = require('../controllers/groupController');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
// faculty can read groups (to assign exams); only admins manage them
router.get('/', authorize('admin', 'faculty'), validate({ query: v.pagination }), c.list);
router.get('/:id', authorize('admin', 'faculty'), validate({ params: v.idParam }), c.getById);
router.post('/', authorize('admin'), validate({ body: v.groupBody }), c.create);
router.patch('/:id', authorize('admin'), validate({ params: v.idParam, body: v.groupUpdate }), c.update);
router.delete('/:id', authorize('admin'), validate({ params: v.idParam }), c.remove);
router.post('/:id/members', authorize('admin'), validate({ params: v.idParam, body: v.groupMembers }), c.addMembers);
router.delete('/:id/members/:userId', authorize('admin'), validate({ params: v.groupMemberParams }), c.removeMember);

module.exports = router;
