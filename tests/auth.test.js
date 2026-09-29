const request = require('supertest');
const { createStore } = require('./mocks/prisma.mock');

const mockPrisma = createStore();
jest.mock('../src/config/prisma', () => mockPrisma);

const app = require('../src/app');

describe('Auth', () => {
  const user = { name: 'Asha Rao', email: 'asha@example.com', password: 'password123' };

  it('signs up a new user and returns a token', async () => {
    const res = await request(app).post('/auth/signup').send(user);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.passwordHash).toBeUndefined(); // never leak the hash
  });

  it('rejects signup with a short password', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ name: 'X', email: 'x@example.com', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate email', async () => {
    const res = await request(app).post('/auth/signup').send(user);
    expect(res.status).toBe(409);
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: user.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('rejects login with wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('rejects login for an email that does not exist', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });
    expect(res.status).toBe(401);
  });
});
