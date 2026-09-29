const prisma = require('../config/prisma');

// POST /bookings  { testId, appointmentAt }
async function createBooking(req, res, next) {
  try {
    const { testId, appointmentAt } = req.body;
    if (!testId || !appointmentAt) {
      return res.status(400).json({ error: 'testId and appointmentAt are required' });
    }

    const appointmentDate = new Date(appointmentAt);
    if (Number.isNaN(appointmentDate.getTime())) {
      return res.status(400).json({ error: 'appointmentAt must be a valid ISO date' });
    }
    if (appointmentDate.getTime() < Date.now()) {
      return res.status(400).json({ error: 'appointmentAt must be in the future' });
    }

    const test = await prisma.diagnosticTest.findUnique({ where: { id: testId } });
    if (!test) {
      return res.status(404).json({ error: 'Diagnostic test not found' });
    }

    const booking = await prisma.booking.create({
      data: {
        userId: req.user.id,
        testId: test.id,
        centreId: test.centreId,
        appointmentAt: appointmentDate,
        amount: test.price,
        status: 'PENDING',
      },
      include: { test: true, centre: true },
    });

    res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
}

// GET /bookings  - the caller's own bookings only
async function listMyBookings(req, res, next) {
  try {
    const bookings = await prisma.booking.findMany({
      where: { userId: req.user.id },
      include: { test: true, centre: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(bookings);
  } catch (err) {
    next(err);
  }
}

// GET /bookings/:id
async function getBooking(req, res, next) {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: { test: true, centre: true, payments: true },
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.userId !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this booking' });
    }
    res.json(booking);
  } catch (err) {
    next(err);
  }
}

// PATCH /bookings/:id/cancel
async function cancelBooking(req, res, next) {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.userId !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this booking' });
    }
    if (booking.status === 'CONFIRMED') {
      return res.status(400).json({ error: 'A confirmed (paid) booking cannot be cancelled here' });
    }
    if (booking.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Booking is already cancelled' });
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

module.exports = { createBooking, listMyBookings, getBooking, cancelBooking };
