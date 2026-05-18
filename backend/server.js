require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const winston = require('winston');

// Import Middleware
const rateLimiter = require('./middleware/rateLimiter');
const sanitizeInput = require('./middleware/sanitize');
const applyContext = require('./middleware/contextApplier');

// Import Routes
const analyzeRoute = require('./routes/analyze');
const scanRoute = require('./routes/scan');
const newsRoute = require('./routes/news');
const feedbackRoute = require('./routes/feedback');
const chatRoute = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 8080;

// Winston Logger Setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Cloud Run menggunakan reverse proxy — wajib agar express-rate-limit & IP detection bekerja
app.set('trust proxy', true);

// Middleware Stack
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(rateLimiter);
app.use(sanitizeInput);
app.use(applyContext);

// Request Logger
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Serve Static Frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Routes
app.use('/api/analyze', analyzeRoute);
app.use('/api/scan', scanRoute);
app.use('/api/news', newsRoute);
app.use('/api/feedback', feedbackRoute);
app.use('/api/chat', chatRoute);

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Abjad.in',
    timestamp: new Date().toISOString()
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error(err.message);
  // Do not expose stack trace
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start Server
const localBlacklist = require('./services/localBlacklist');
const server = app.listen(PORT, () => {
  console.log(`🛡️ Abjad.in — Baca Dulu, Baru Klik. Running on port ${PORT}`);
  // Load blacklist secara asynchronous agar tidak memblokir startup utama
  setTimeout(() => {
    localBlacklist.loadAllDatasets();
  }, 1000);
});

// Graceful Shutdown handling for Cloud Run
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

module.exports = app;
