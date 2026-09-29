const request = require('supertest');
const { createStore } = require('./mocks/prisma.mock');

const mockPrisma = createStore();
jest.mock('../src/config/prisma', () => mockPrisma);

const app = require('../src/app');

async function signup(email) {
  const res = await request(app)
    .post('/auth/signup')
    .send({ name: 'Test User', email, password: 'password123' });
  return { token: res.body.token, user: res.body.user };
}

describe('Bookings', () => {
  let token, otherToken, test1;
  const futureDate = new Date(Date.now() + 86400000).toISOString();

  beforeAll(async () => {
    ({ token } = await signup('patient1@example.com'));
    ({ token: otherToken } = await signup('patient2@example.com'));

    const centre = await mockPrisma.diagnosticCentre.create({
      data: { name: 'Sunrise Diagnostics', location: 'Bhubaneswar' },
    });
    test1 = await mockPrisma.diagnosticTest.create({
      data: { name: 'CBC', price: 300, centreId: centre.id },
    });
  });

  it('rejects booking creation without a token', async () => {
    const res = await request(app).post('/bookings').send({ testId: test1.id, appointmentAt: futureDate });
    expect(res.status).toBe(401);
  });

  it('rejects a booking with a past appointment date', async () => {
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ testId: test1.id, appointmentAt: '2020-01-01T00:00:00.000Z' });
    expect(res.status).toBe(400);
  });

  it('rejects a booking for a non-existent test', async () => {
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ testId: 'does-not-exist', appointmentAt: futureDate });
    expect(res.status).toBe(404);
  });

  let bookingId;
  it('creates a booking as PENDING with amount copied from the test price', async () => {
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ testId: test1.id, appointmentAt: futureDate });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(Number(res.body.amount)).toBe(300);
    bookingId = res.body.id;
  });

  it('denies a different user from viewing the booking', async () => {
    const res = await request(app)
      .get(`/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it('lets the owner view their own booking', async () => {
    const res = await request(app)
      .get(`/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(bookingId);
  });

  it('lets the owner cancel a pending booking', async () => {
    const res = await request(app)
      .patch(`/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });

  it('rejects cancelling an already-cancelled booking', async () => {
    const res = await request(app)
      .patch(`/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
