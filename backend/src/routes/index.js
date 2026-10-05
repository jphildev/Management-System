const router = require('express').Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.use('/auth', require('./authRoutes'));
router.use('/records', require('./recordRoutes'));

module.exports = router;
