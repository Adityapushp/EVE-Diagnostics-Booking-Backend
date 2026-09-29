const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  createBooking,
  listMyBookings,
  getBooking,
  cancelBooking,
} = require('../controllers/booking.controller');

const router = express.Router();

router.use(requireAuth); // every booking route requires a logged-in user

router.post('/', createBooking);
router.get('/', listMyBookings);
router.get('/:id', getBooking);
router.patch('/:id/cancel', cancelBooking);

module.exports = router;
