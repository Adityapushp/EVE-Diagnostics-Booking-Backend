const prisma = require('../config/prisma');
const { decideOutcome } = require('../services/payment.service');

const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'dev-webhook-secret';

// POST /payments/  (auth required)  { bookingId, forceStatus? }
// Simulates calling a payment provider and getting an immediate result.
// forceStatus is a testing hook ("SUCCESS" | "FAILED"), never exposed to
// real users in production - see README "assumptions".
async function initiatePayment(req, res, next) {
  try {
    const { bookingId, forceStatus } = req.body;
    if (!bookingId) {
      return res.status(400).json({ error: 'bookingId is required' });
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { payments: true },
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.userId !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this booking' });
    }
    if (booking.status === 'CONFIRMED') {
      return res.status(400).json({ error: 'Booking is already paid for' });
    }
    if (booking.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Cannot pay for a cancelled booking' });
    }

    const outcome = decideOutcome(forceStatus);

    // Payment row + booking status update happen together so a crash
    // between the two can never leave a SUCCESS payment on a PENDING booking.
    const [payment] = await prisma.$transaction([
      prisma.payment.create({
        data: {
          bookingId: booking.id,
          amount: booking.amount,
          status: outcome,
        },
      }),
      prisma.booking.update({
        where: { id: booking.id },
        data: { status: outcome === 'SUCCESS' ? 'CONFIRMED' : 'FAILED' },
      }),
    ]);

    res.status(201).json({
      payment,
      bookingStatus: outcome === 'SUCCESS' ? 'CONFIRMED' : 'FAILED',
    });
  } catch (err) {
    next(err);
  }
}

// POST /payments/webhook/  (no user auth - this is provider-to-server)
// Body: { eventId, providerRef, status }
// Protected by a shared-secret header instead of a JWT, since the caller
// here is the payment provider, not a logged-in user.
//
// Idempotency: eventId is unique per delivery attempt from the provider.
// We check WebhookEvent for it BEFORE touching Payment/Booking, and the
// unique DB constraint on eventId is the real guarantee (belt and braces)
// in case two identical requests land at the same instant.
async function paymentWebhook(req, res, next) {
  try {
    const signature = req.headers['x-webhook-secret'];
    if (signature !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const { eventId, providerRef, status } = req.body;
    if (!eventId || !providerRef || !status) {
      return res.status(400).json({ error: 'eventId, providerRef and status are required' });
    }
    if (!['SUCCESS', 'FAILED'].includes(status)) {
      return res.status(400).json({ error: 'status must be SUCCESS or FAILED' });
    }

    const alreadySeen = await prisma.webhookEvent.findUnique({ where: { eventId } });
    if (alreadySeen) {
      // Replay of an event we've already applied - acknowledge without
      // reprocessing so the provider stops retrying, but don't touch state.
      return res.status(200).json({ message: 'Event already processed', duplicate: true });
    }

    const payment = await prisma.payment.findUnique({ where: { providerRef } });
    if (!payment) {
      return res.status(404).json({ error: 'Unknown providerRef' });
    }

    try {
      await prisma.$transaction([
        prisma.webhookEvent.create({
          data: { eventId, payload: req.body },
        }),
        prisma.payment.update({
          where: { id: payment.id },
          data: { status },
        }),
        prisma.booking.update({
          where: { id: payment.bookingId },
          data: { status: status === 'SUCCESS' ? 'CONFIRMED' : 'FAILED' },
        }),
      ]);
    } catch (txErr) {
      // Race: two copies of the same webhook hit the unique eventId
      // constraint at the same time. Whichever loses just reports duplicate.
      if (txErr.code === 'P2002') {
        return res.status(200).json({ message: 'Event already processed', duplicate: true });
      }
      throw txErr;
    }

    res.status(200).json({ message: 'Webhook processed', duplicate: false });
  } catch (err) {
    next(err);
  }
}

module.exports = { initiatePayment, paymentWebhook };
