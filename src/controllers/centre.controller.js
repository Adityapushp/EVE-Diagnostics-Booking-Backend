const prisma = require('../config/prisma');

// GET /centres?location=Pune  (location filter optional)
async function listCentres(req, res, next) {
  try {
    const { location } = req.query;
    const centres = await prisma.diagnosticCentre.findMany({
      where: location ? { location: { contains: location, mode: 'insensitive' } } : undefined,
      include: { tests: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(centres);
  } catch (err) {
    next(err);
  }
}

// GET /centres/:id
async function getCentre(req, res, next) {
  try {
    const centre = await prisma.diagnosticCentre.findUnique({
      where: { id: req.params.id },
      include: { tests: true },
    });
    if (!centre) return res.status(404).json({ error: 'Centre not found' });
    res.json(centre);
  } catch (err) {
    next(err);
  }
}

// POST /centres  { name, location }
// In a real product this would be admin-only; kept open here since the
// assignment doesn't define roles, but it's the obvious next step (see README).
async function createCentre(req, res, next) {
  try {
    const { name, location } = req.body;
    if (!name || !location) {
      return res.status(400).json({ error: 'name and location are required' });
    }
    const centre = await prisma.diagnosticCentre.create({ data: { name, location } });
    res.status(201).json(centre);
  } catch (err) {
    next(err);
  }
}

// POST /centres/:id/tests  { name, price }
async function addTest(req, res, next) {
  try {
    const { name, price } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'name and price are required' });
    }
    if (Number.isNaN(Number(price)) || Number(price) <= 0) {
      return res.status(400).json({ error: 'price must be a positive number' });
    }

    const centre = await prisma.diagnosticCentre.findUnique({ where: { id: req.params.id } });
    if (!centre) return res.status(404).json({ error: 'Centre not found' });

    const test = await prisma.diagnosticTest.create({
      data: { name, price, centreId: centre.id },
    });
    res.status(201).json(test);
  } catch (err) {
    next(err);
  }
}

// GET /tests?centreId=...  - flat list of tests, optionally scoped to a centre
async function listTests(req, res, next) {
  try {
    const { centreId } = req.query;
    const tests = await prisma.diagnosticTest.findMany({
      where: centreId ? { centreId } : undefined,
      include: { centre: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(tests);
  } catch (err) {
    next(err);
  }
}

module.exports = { listCentres, getCentre, createCentre, addTest, listTests };
