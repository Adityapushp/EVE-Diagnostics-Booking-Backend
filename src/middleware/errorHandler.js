// Catches anything thrown/passed to next(err) in route handlers so every
// error path returns a consistent JSON shape instead of leaking stack traces.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);

  // Prisma "record not found" style errors
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Resource not found' });
  }
  // Prisma unique constraint violation
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Resource already exists', fields: err.meta?.target });
  }

  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
}

module.exports = errorHandler;
