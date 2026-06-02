# TRAX · Crowdsource Real-Time Vehicle Tracker

TRAX is a production-grade, real-time vehicle tracking web application that uses crowdsourcing as its primary location source with a simulated cell tower triangulation fallback.

## Features

- GPS tracking with high accuracy
- Cell tower triangulation fallback (simulated for now)
- Real-time WebSocket updates
- In-memory state with TTL-based cleanup (no database required)
- Offline queue for resilience
- Session persistence
- Mobile-first responsive UI
- Security hardening (helmet, cors, rate-limiting)
- Compression and request logging

## Installation

```bash
npm install
```

## Running the Application

```bash
npm start
```

The server will start on http://localhost:3000 by default.

## Environment Variables

- `PORT`: The port the server listens on (default: 3000)
- `CORS_ORIGIN`: Allowed origin for CORS (default: *)

## API Endpoints

### POST /api/location

Send vehicle location data.

**Request Body:**
```json
{
  "busId": "BUS-101",
  "lat": 26.8467,
  "lng": 80.9462,
  "source": "gps",
  "accuracy": 42,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "busId": "BUS-101",
  "latest": {
    "busId": "BUS-101",
    "lat": 26.8467,
    "lng": 80.9462,
    "source": "gps",
    "accuracy": 42,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### GET /api/bus/:busId/location

Get the latest known location of a specific vehicle.

**Response (200 OK):**
```json
{
  "busId": "BUS-101",
  "latest": {
    "busId": "BUS-101",
    "lat": 26.8467,
    "lng": 80.9462,
    "source": "gps",
    "accuracy": 42,
    "timestamp": "2024-01-15T10:30:00.000Z"
  },
  "history": [
    /* Last 5 locations */
  ],
  "lastUpdate": "2024-01-15T10:30:00.000Z"
}
```

## Socket.io Events

### Client → Server
- `subscribe`: { "busId": "BUS-101" } - Join bus room to receive updates for that bus
- `unsubscribe`: { "busId": "BUS-101" } - Leave bus room

### Server → Client
- `initialState`: Full map of active BusState records
- `locationUpdate`: Updated BusState for a specific vehicle
- `busExpired`: { "busId": "BUS-101" } - Vehicle TTL expired (30s without updates)

## Cell Tower Fallback

If GPS is unavailable (permission denied, timeout, etc.), TRAX automatically switches to simulated cell tower triangulation. You can also manually force cell tower mode using the "📡 Force Cell Tower" button.
