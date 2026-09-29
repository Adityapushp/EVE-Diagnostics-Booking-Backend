const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const authRoutes = require('./routes/auth.routes');
const centreRoutes = require('./routes/centre.routes');
const bookingRoutes = require('./routes/booking.routes');
const paymentRoutes = require('./routes/payment.routes');
const errorHandler = require('./middleware/errorHandler');
const swaggerDocument = require('../docs/openapi.json');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use('/auth', authRoutes);
app.use('/', centreRoutes); // exposes /centres and /tests
app.use('/bookings', bookingRoutes);
app.use('/payments', paymentRoutes);

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use(errorHandler);

module.exports = app;
