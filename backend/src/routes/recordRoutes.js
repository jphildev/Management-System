const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { protect } = require('../middleware/auth');
const { createRecord, getRecords } = require('../controllers/recordController');

router.use(protect);
router.post('/', asyncHandler(createRecord));
router.get('/', asyncHandler(getRecords));

module.exports = router;
