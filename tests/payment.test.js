const request = require('supertest');
const { createStore } = require('./mocks/prisma.mock');

const mockPrisma = createStore();
jest.mock('../src/config/prisma', () => mockPrisma);

const app = require('../src/app');
const WEBHOOK_SECRET = 'test-webhook-secret';

async function setupBooking() {
  const signupRes = await request(app)
    .post('/auth/signup')
    .send({ name: 'Payer', email: `payer-${Date.now()}@example.com`, password: 'password123' });
  const token = signupRes.body.token;

  const centre = await mockPrisma.diagnosticCentre.create({
    data: { name: 'MetroPath Labs', location: 'Patna' },
  });
  const test = await mockPrisma.diagnosticTest.create({
    data: { name: 'Lipid Profile', price: 650, centreId: centre.id },
  });

  const bookingRes = await request(app)
    .post('/bookings')
    .set('Authorization', `Bearer ${token}`)
    .send({ testId: test.id, appointmentAt: new Date(Date.now() + 86400000).toISOString() });

  return { token, booking: bookingRes.body };
}

describe('Payments', () => {
  it('confirms a booking on a simulated SUCCESS payment', async () => {
    const { token, booking } = await setupBooking();
    const res = await request(app)
      .post('/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingId: booking.id, forceStatus: 'SUCCESS' });

    expect(res.status).toBe(201);
    expect(res.body.bookingStatus).toBe('CONFIRMED');
    expect(res.body.payment.status).toBe('SUCCESS');
  });

  it('marks a booking FAILED on a simulated FAILED payment', async () => {
    const { token, booking } = await setupBooking();
    const res = await request(app)
      .post('/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingId: booking.id, forceStatus: 'FAILED' });

    expect(res.status).toBe(201);
    expect(res.body.bookingStatus).toBe('FAILED');
  });

  it('refuses to pay for a booking that already succeeded', async () => {
    const { token, booking } = await setupBooking();
    await request(app)
      .post('/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingId: booking.id, forceStatus: 'SUCCESS' });

    const res = await request(app)
      .post('/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingId: booking.id, forceStatus: 'SUCCESS' });
    expect(res.status).toBe(400);
  });

  describe('Webhook idempotency', () => {
    it('rejects a webhook call without the shared secret', async () => {
      const res = await request(app).post('/payments/webhook').send({
        eventId: 'evt_1',
        providerRef: 'whatever',
        status: 'SUCCESS',
      });
      expect(res.status).toBe(401);
    });

    it('processes a webhook once and ignores an exact replay of the same eventId', async () => {
      const { token, booking } = await setupBooking();

      // Create a PENDING payment the "provider" will later confirm via webhook.
      const paymentRow = await mockPrisma.payment.create({
        data: { bookingId: booking.id, amount: 650, status: 'PENDING' },
      });

      const webhookBody = {
        eventId: 'evt_confirm_1',
        providerRef: paymentRow.providerRef,
        status: 'SUCCESS',
      };

      const first = await request(app)
        .post('/payments/webhook')
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send(webhookBody);
      expect(first.status).toBe(200);
      expect(first.body.duplicate).toBe(false);

      const updatedBooking = await mockPrisma.booking.findUnique({ where: { id: booking.id } });
      expect(updatedBooking.status).toBe('CONFIRMED');

      // Replay - same eventId, e.g. provider retried delivery.
      const second = await request(app)
        .post('/payments/webhook')
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send(webhookBody);
      expect(second.status).toBe(200);
      expect(second.body.duplicate).toBe(true);

      // Booking state must not have been touched a second time.
      const stillConfirmed = await mockPrisma.booking.findUnique({ where: { id: booking.id } });
      expect(stillConfirmed.status).toBe('CONFIRMED');
      expect(stillConfirmed.updatedAt.getTime()).toBe(updatedBooking.updatedAt.getTime());
    });

    it('returns 404 for an unknown providerRef', async () => {
      const res = await request(app)
        .post('/payments/webhook')
        .set('x-webhook-secret', WEBHOOK_SECRET)
        .send({ eventId: 'evt_unknown', providerRef: 'not-a-real-ref', status: 'SUCCESS' });
      expect(res.status).toBe(404);
    });
  });
});
