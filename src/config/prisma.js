const { PrismaClient } = require('@prisma/client');

// Single shared instance so we don't open a new connection pool per request.
const prisma = new PrismaClient();

module.exports = prisma;
