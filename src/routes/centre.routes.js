const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  listCentres,
  getCentre,
  createCentre,
  addTest,
  listTests,
} = require('../controllers/centre.controller');

const router = express.Router();

// Browsing centres/tests is public - a patient should be able to compare
// prices before creating an account. Only mutating data requires auth.
router.get('/centres', listCentres);
router.get('/centres/:id', getCentre);
router.post('/centres', requireAuth, createCentre);
router.post('/centres/:id/tests', requireAuth, addTest);
router.get('/tests', listTests);

module.exports = router;
