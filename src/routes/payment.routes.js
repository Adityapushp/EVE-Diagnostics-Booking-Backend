const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { initiatePayment, paymentWebhook } = require('../controllers/payment.controller');

const router = express.Router();

router.post('/', requireAuth, initiatePayment);
// Webhook is intentionally NOT behind requireAuth - the caller is the
// payment provider, authenticated via the x-webhook-secret header instead.
router.post('/webhook', paymentWebhook);

module.exports = router;
