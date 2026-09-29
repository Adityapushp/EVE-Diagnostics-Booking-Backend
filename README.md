EVE Diagnostics Booking Backend

Backend for the EVE Healthcare SDE Intern — Backend Engineering Assignment: diagnostic test bookings with simulated payments.

Built with Node.js, Express, Prisma, and PostgreSQL.

Why Node/Express?

The assignment allows Django, FastAPI, Flask, or another backend framework you are comfortable with. I chose Node.js/Express because it is the stack I am strongest in day-to-day.

The core requirements — authentication, resource APIs, bookings, simulated payments, and an idempotent webhook — are framework-agnostic, so I focused on implementing them cleanly rather than using an unfamiliar stack.

Stack

Express — HTTP layer

Prisma + PostgreSQL — schema and database access

jsonwebtoken + bcryptjs — authentication and password hashing

Jest + Supertest — API/controller tests

Swagger UI — interactive API documentation at /docs

Docker Compose — application + PostgreSQL

Running Locally

Option A — Docker (recommended)

Requires Docker Desktop.

docker compose up --build

This starts PostgreSQL, waits for the database to become healthy, synchronizes the Prisma schema with prisma db push, and starts the API on:

http://localhost:4000

Interactive API documentation:

http://localhost:4000/docs

Health check:

http://localhost:4000/health

To stop the services:

docker compose down

To also remove the PostgreSQL volume:

docker compose down -v

Seed sample data

The seed script creates sample diagnostic centres and tests:

docker compose exec api npm run prisma:seed

Option B — Directly on your machine

Requires Node.js 20+ and a running PostgreSQL instance.

npm install

Create a .env file from .env.example and configure DATABASE_URL:

cp .env.example .env

Generate the Prisma client:

npx prisma generate

For local development, create/apply the initial migration:

npx prisma migrate dev --name init

Optionally seed sample data:

npm run prisma:seed

Start the development server:

npm run dev

The API is now available at:

http://localhost:4000

Swagger UI:

http://localhost:4000/docs

Note: The current Docker setup uses prisma db push because the repository does not commit a Prisma migration history. For a production deployment, I would commit the generated prisma/migrations directory and use prisma migrate deploy.

Running Tests

npm test

Tests run against an in-memory fake Prisma client (tests/mocks/prisma.mock.js), so the test suite does not require PostgreSQL or Docker.

This was a deliberate trade-off for the assignment time box. The tests exercise real controller/application logic including authentication, ownership checks, booking state transitions, payments, and webhook idempotency.

They do not verify Prisma's generated SQL or PostgreSQL-specific constraint behaviour. With more time, I would add a second suite against a real PostgreSQL test database.

API Overview

All request/response bodies are JSON.

Authenticated routes require:

Authorization: Bearer <token>

Method

Path

Auth

Description

POST

/auth/signup

—

{ name, email, password } → user + JWT

POST

/auth/login

—

{ email, password } → user + JWT

GET

/centres

—

List centres; optional ?location=

GET

/centres/:id

—

Get one centre with its tests

POST

/centres

✓

{ name, location }

POST

/centres/:id/tests

✓

{ name, price }

GET

/tests

—

List tests; optional ?centreId=

POST

/bookings

✓

{ testId, appointmentAt } → PENDING booking

GET

/bookings

✓

List current user's bookings

GET

/bookings/:id

✓

Get one booking; owner only

PATCH

/bookings/:id/cancel

✓

Cancel an eligible booking

POST

/payments

✓

Simulate payment and update booking

POST

/payments/webhook

secret header

Process provider payment event; idempotent

Example: Book and Pay

1. Sign up

curl -X POST http://localhost:4000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Asha","email":"asha@example.com","password":"password123"}'

Response contains:

{
  "user": {},
  "token": "<jwt-token>"
}

2. Get available tests

curl http://localhost:4000/tests

Copy a testId from the response.

3. Book a test

curl -X POST http://localhost:4000/bookings \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"testId":"<testId>","appointmentAt":"2026-10-05T09:00:00Z"}'

The new booking starts as:

PENDING

4. Simulate payment

curl -X POST http://localhost:4000/payments \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"bookingId":"<bookingId>","forceStatus":"SUCCESS"}'

The booking becomes:

CONFIRMED

5. Simulate a provider webhook

A webhook can update an existing payment asynchronously:

curl -X POST http://localhost:4000/payments/webhook \
  -H "x-webhook-secret: dev-webhook-secret" \
  -H "Content-Type: application/json" \
  -d '{"eventId":"evt_123","providerRef":"<providerRef>","status":"SUCCESS"}'

Sending the exact same event again returns:

{
  "duplicate": true
}

and does not apply the event again.

Database / Schema Design

The database is modelled around six entities.

User

id

name

email

passwordHash

createdAt

A user has many bookings. Email is unique and passwords are stored only as bcrypt hashes.

DiagnosticCentre

id

name

location

createdAt

A centre can offer multiple diagnostic tests.

DiagnosticTest

id

name

price

centreId

createdAt

The price belongs to the test because different centres can offer the same test at different prices.

(centreId, name) is unique, so one centre cannot list the same test twice while different centres can each offer, for example, CBC at different prices.

Booking

id

userId

testId

centreId

appointmentAt

amount

status

createdAt

updatedAt

The centre is stored directly on the booking so the booking retains its centre relationship even if catalogue relationships change later.

The test price is copied into amount when the booking is created. A later price change therefore does not retroactively change an existing booking.

Supported booking states:

PENDING
CONFIRMED
FAILED
CANCELLED

Payment

id

bookingId

providerRef

status

amount

createdAt

updatedAt

A booking can have multiple payment attempts, for example a failed attempt followed by a retry.

WebhookEvent

id

eventId

payload

receivedAt

eventId is unique and acts as the database-backed idempotency guard for payment webhooks.

Payment & Webhook Design

Synchronous payment

POST /payments simulates the payment provider and immediately returns either SUCCESS or FAILED.

The payment record and booking status are updated in the same Prisma transaction so they cannot disagree.

Conceptually:

Payment SUCCESS
      │
      └──> Booking CONFIRMED

Payment FAILED
      │
      └──> Booking FAILED

Asynchronous webhook

POST /payments/webhook models the more realistic provider-notification case.

The provider sends:

{
  "eventId": "evt_123",
  "providerRef": "pay_123",
  "status": "SUCCESS"
}

The endpoint:

Validates the webhook secret.

Validates the event payload.

Checks whether eventId has already been processed.

Finds the associated payment using providerRef.

Updates the payment and booking in a transaction.

Records the webhook event.

Why the webhook is idempotent

The implementation does not rely only on an application-level find() check.

WebhookEvent.eventId has a unique database constraint.

This matters when two copies of the same webhook arrive at nearly the same time:

Request A ──┐
            ├──> unique eventId constraint ──> only one succeeds
Request B ──┘

If the second request loses the race, the Prisma P2002 unique-violation is treated as an already-processed event.

Therefore, replaying the same webhook cannot create duplicate processing or corrupt the booking state.

Edge-Case Handling

The implementation explicitly handles:

Invalid request payloads

Missing required fields

Invalid or expired JWTs

Duplicate signup emails

Invalid booking IDs

Non-existent diagnostic tests

Past appointment dates

Unauthorized access to another user's booking

Attempts to modify resources without authorization

Failed payments

Payments against invalid booking states

Missing or invalid webhook secrets

Unknown payment provider references

Repeated webhook events

Repeated booking cancellation

Duplicate diagnostic tests within the same centre

Common HTTP responses include:

Status

Meaning

400

Invalid request or invalid state transition

401

Missing/invalid authentication or webhook secret

403

Authenticated but not authorized

404

Resource not found

409

Duplicate/unique constraint conflict

500

Unexpected server error

Design Choices / Assumptions

POST /payments is synchronous

The endpoint immediately simulates a provider response and updates the booking in the same request.

This directly satisfies the assignment requirement that the simulated payment results in either SUCCESS or FAILED.

forceStatus is a testing convenience

POST /payments accepts:

{
  "forceStatus": "SUCCESS"
}

or:

{
  "forceStatus": "FAILED"
}

This makes both paths deterministic during testing and demos instead of relying only on the simulated provider's random outcome.

In a real payment integration, a client would never be allowed to choose its own payment result.

Webhook authentication uses a shared secret

The simulated provider sends:

x-webhook-secret: <secret>

The webhook does not use JWT authentication because the caller is a payment provider rather than a logged-in application user.

A production integration would normally verify the provider's signed webhook payload/HMAC instead.

Public catalogue reads

Browsing centres and tests is public:

GET /centres
GET /centres/:id
GET /tests

Creating centres/tests requires authentication.

The assignment does not define user roles, so the current implementation does not introduce an admin role. In production, centre/test management would be restricted to an admin role.

Confirmed bookings cannot be cancelled

A CONFIRMED booking cannot currently be cancelled because cancellation of a paid booking would require a refund flow, which is outside the assignment scope.

Appointment conflicts are out of scope

The implementation validates that an appointment is in the future but does not implement slot inventory, provider availability, or double-booking prevention.

Docker uses prisma db push

The repository does not currently commit a Prisma migration history.

Therefore Docker uses:

npx prisma db push --skip-generate

to synchronize the database schema.

For a production deployment, I would commit a proper prisma/migrations directory and switch deployment to:

npx prisma migrate deploy

Testing

Run:

npm test

The tests cover:

Authentication

Successful signup

Password validation

Duplicate email handling

Successful login

Incorrect password handling

Unknown email handling

Bookings

Authentication requirements

Past appointment rejection

Invalid test handling

Booking creation

Price snapshotting

Booking ownership

Booking retrieval

Cancellation

Repeated cancellation

Payments

Successful payment

Failed payment

Invalid payment state

Webhook authentication

Webhook processing

Duplicate webhook replay

Unknown provider reference

The current test setup intentionally uses an in-memory Prisma-compatible mock. This keeps the suite fast and independent of Docker/PostgreSQL while still exercising the application/controller logic.

What I'd Improve With More Time

1. Role-based access

Introduce roles such as:

PATIENT
ADMIN

and restrict diagnostic-centre/test management to administrators.

2. Real PostgreSQL integration tests

Add a second test suite against a throwaway PostgreSQL database, for example in CI using Docker.

This would verify:

Prisma's actual generated queries

Database constraints

Unique indexes

Transactions

Concurrent webhook delivery

3. Rate limiting

Add rate limiting to sensitive endpoints such as:

/auth/login
/auth/signup
/payments
/payments/webhook

4. Structured logging

Move from basic HTTP logging to structured logs with request IDs and identifiers such as:

requestId
userId
bookingId
paymentId
providerRef

This would make a booking → payment → webhook flow easier to trace in production.

5. Pagination

Add pagination to collections such as:

GET /bookings
GET /centres
GET /tests

once the dataset becomes large.

6. Webhook retry/backoff

For a real payment provider, add retry/backoff handling and a dead-letter mechanism for events that repeatedly fail.

7. Production payment integration

Replace the simulated provider with a real payment provider while keeping the payment-provider logic isolated behind the service layer.

8. Migration-based deployment

Commit Prisma migrations and use:

prisma migrate deploy

for production deployments instead of db push.

Useful npm Commands

# Install dependencies
npm install

# Development server
npm run dev

# Production-style server
npm start

# Generate Prisma client
npm run prisma:generate

# Create/apply a development migration
npm run prisma:migrate

# Seed sample data
npm run prisma:seed

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

Project Structure

eve-backend/
├── prisma/
│   ├── schema.prisma
│   └── seed.js
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── app.js
│   └── server.js
├── tests/
│   ├── mocks/
│   ├── auth.test.js
│   ├── booking.test.js
│   ├── payment.test.js
│   └── setup-env.js
├── docs/
│   └── openapi.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
├── package-lock.json
└── README.md

Assignment Coverage

Requirement

Implementation

User signup

POST /auth/signup

User login

POST /auth/login

JWT authentication

JWT middleware

Request validation

Controller/input validation

Diagnostic centres

Centre APIs + PostgreSQL

Diagnostic tests

Test APIs + centre relationships

Test pricing

DiagnosticTest.price

Authenticated bookings

Booking APIs

Appointment date/time

Booking.appointmentAt

Booking amount

Price snapshot on booking

Booking states

PENDING, CONFIRMED, FAILED, CANCELLED

Simulated payment

POST /payments

Payment success/failure

SUCCESS / FAILED

Payment webhook

POST /payments/webhook

Webhook idempotency

Unique WebhookEvent.eventId

Edge-case handling

Validation, authorization, state checks, duplicate handling

Tests

Jest + Supertest

Docker

Dockerfile + Docker Compose

Swagger/OpenAPI

/docs