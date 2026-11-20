const router = require('express').Router();
const c = require('../controllers/authController');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

router.post('/register', validate({ body: v.register }), c.register);
router.post('/login', validate({ body: v.login }), c.login);
router.post('/refresh', validate({ body: v.refresh }), c.refresh);
router.post('/logout', authenticate, c.logout);

module.exports = router;
