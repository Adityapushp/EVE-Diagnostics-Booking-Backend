// Stands in for a real payment gateway SDK. Kept as a separate module so
// swapping in Stripe/Razorpay later only means changing this file, not the
// controllers or the webhook-idempotency logic around it.

// Simulates calling out to a payment provider to start a charge.
// In real life this call would return quickly with a "pending" reference,
// and the provider would tell us the real outcome later via webhook -
// that's why /payments/ only ever creates a PENDING Payment row.
function initiateSimulatedPayment() {
  return {
    providerRef: undefined, // let Prisma default (uuid) generate it
    status: 'PENDING',
  };
}

// Simulates the provider deciding an outcome, used by the demo/webhook
// trigger endpoint below. ~85% success rate, unless forced by the caller
// (handy for testing the FAILED path deterministically).
function decideOutcome(forceStatus) {
  if (forceStatus === 'SUCCESS' || forceStatus === 'FAILED') return forceStatus;
  return Math.random() < 0.85 ? 'SUCCESS' : 'FAILED';
}

module.exports = { initiateSimulatedPayment, decideOutcome };
