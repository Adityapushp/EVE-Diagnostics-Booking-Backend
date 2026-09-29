// A minimal in-memory stand-in for @prisma/client, covering only the
// methods this project actually calls. This lets the test suite run
// without a live Postgres instance while still exercising real
// controller logic (not just mocked-out assertions).
const { randomUUID } = require('crypto');

function createStore() {
  const tables = {
    user: [],
    diagnosticCentre: [],
    diagnosticTest: [],
    booking: [],
    payment: [],
    webhookEvent: [],
  };

  function makeModel(name) {
    return {
      async findUnique({ where, include }) {
        const row = tables[name].find((r) =>
          Object.entries(where).every(([k, v]) => r[k] === v)
        );
        return row ? attach(name, row, include) : null;
      },
      async findMany({ where, include, orderBy } = {}) {
        let rows = tables[name].filter((r) =>
          where ? Object.entries(where).every(([k, v]) => v === undefined || r[k] === v) : true
        );
        if (orderBy?.createdAt === 'desc') {
          rows = [...rows].sort((a, b) => b.createdAt - a.createdAt);
        }
        return rows.map((r) => attach(name, r, include));
      },
      async create({ data, select }) {
        const row = {
          id: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...(name === 'payment' ? { providerRef: randomUUID() } : {}),
          ...data,
        };
        // Handle nested create (used only in seed script, not in tests)
        tables[name].push(row);
        if (select) {
          const picked = {};
          Object.keys(select).forEach((k) => {
            if (select[k]) picked[k] = row[k];
          });
          return picked;
        }
        return { ...row };
      },
      async update({ where, data }) {
        const row = tables[name].find((r) =>
          Object.entries(where).every(([k, v]) => r[k] === v)
        );
        if (!row) {
          const err = new Error('Record not found');
          err.code = 'P2025';
          throw err;
        }
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
    };
  }

  function attach(name, row, include) {
    if (!include) return { ...row };
    const result = { ...row };
    if (include.test && name !== 'diagnosticTest') {
      result.test = tables.diagnosticTest.find((t) => t.id === row.testId) || null;
    }
    if (include.centre && name !== 'diagnosticCentre') {
      result.centre = tables.diagnosticCentre.find((c) => c.id === row.centreId) || null;
    }
    if (include.payments) {
      result.payments = tables.payment.filter((p) => p.bookingId === row.id);
    }
    if (include.tests) {
      result.tests = tables.diagnosticTest.filter((t) => t.centreId === row.id);
    }
    return result;
  }

  const client = {
    user: makeModel('user'),
    diagnosticCentre: makeModel('diagnosticCentre'),
    diagnosticTest: makeModel('diagnosticTest'),
    booking: makeModel('booking'),
    payment: makeModel('payment'),
    webhookEvent: makeModel('webhookEvent'),
    // Just run the operations sequentially - good enough for tests, since
    // sqlite/postgres-level atomicity isn't what we're verifying here.
    async $transaction(ops) {
      const results = [];
      for (const op of ops) {
        results.push(await op);
      }
      return results;
    },
    _tables: tables, // exposed for test setup/assertions only
  };

  return client;
}

module.exports = { createStore };
