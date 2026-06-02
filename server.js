const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// In-memory state
const busStates = new Map();
const ttlTimers = new Map();
const TTL_DURATION = 30000; // 30 seconds

// Middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));
app.use(cors({ origin: CORS_ORIGIN }));

// Rate limiter for /api/ routes
const apiLimiter = rateLimit({
  windowMs: 1000,
  max: 10,
  message: { error: 'Too many requests' },
  keyGenerator: (req) => req.ip
});
app.use('/api/', apiLimiter);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Validate busId
function isValidBusId(busId) {
  return typeof busId === 'string' && /^[a-zA-Z0-9-]{1,20}$/.test(busId);
}

// Helper: Clear TTL timer for a bus
function clearBusTimer(busId) {
  const timer = ttlTimers.get(busId);
  if (timer) {
    clearTimeout(timer);
    ttlTimers.delete(busId);
  }
}

// Helper: Reset TTL timer for a bus
function resetBusTimer(busId, io) {
  clearBusTimer(busId);
  const timer = setTimeout(() => {
    busStates.delete(busId);
    ttlTimers.delete(busId);
    io.to(`bus-${busId}`).emit('busExpired', { busId });
  }, TTL_DURATION);
  ttlTimers.set(busId, timer);
}

// Endpoints
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/location', (req, res) => {
  const { busId, lat, lng, source, accuracy, timestamp } = req.body;

  if (!busId) {
    return res.status(400).json({ error: 'busId is required' });
  }

  if (!isValidBusId(busId)) {
    return res.status(400).json({ error: 'busId must be alphanumeric (hyphens allowed), max 20 characters' });
  }

  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng must be finite numbers' });
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'lat/lng out of valid range' });
  }

  const payload = {
    busId,
    lat,
    lng,
    source: source || 'unknown',
    accuracy: typeof accuracy === 'number' ? accuracy : null,
    timestamp: timestamp || new Date().toISOString()
  };

  const existing = busStates.get(busId);
  const history = existing ? [...existing.history] : [];
  history.push(payload);
  if (history.length > 5) history.shift();

  const newState = {
    busId,
    latest: payload,
    history,
    lastUpdate: new Date()
  };

  busStates.set(busId, newState);
  resetBusTimer(busId, io);
  io.to(`bus-${busId}`).emit('locationUpdate', newState);

  return res.json({ status: 'ok', busId, latest: payload });
});

app.get('/api/bus/:busId/location', (req, res) => {
  const busId = req.params.busId;

  if (!isValidBusId(busId)) {
    return res.status(400).json({ error: 'Invalid busId format' });
  }

  const state = busStates.get(busId);
  if (!state) {
    return res.status(404).json({ error: 'Bus not found' });
  }

  return res.json(state);
});

// Socket.io
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN }
});

io.on('connection', (socket) => {
  socket.emit('initialState', Object.fromEntries(busStates));

  socket.on('subscribe', ({ busId }) => {
    if (isValidBusId(busId)) {
      socket.join(`bus-${busId}`);
    }
  });

  socket.on('unsubscribe', ({ busId }) => {
    if (isValidBusId(busId)) {
      socket.leave(`bus-${busId}`);
    }
  });
});

// Graceful shutdown
let connections = [];
server.on('connection', (connection) => {
  connections.push(connection);
  connection.on('close', () => {
    connections = connections.filter(c => c !== connection);
  });
});

function gracefulShutdown(signal) {
  console.log(`\n${signal} received: shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Force closing remaining connections');
    connections.forEach(conn => conn.destroy());
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

server.listen(PORT, () => {
  console.log(`TRAX server listening on http://localhost:${PORT}`);
});
