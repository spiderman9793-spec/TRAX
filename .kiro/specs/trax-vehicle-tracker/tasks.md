# Implementation Plan: TRAX Vehicle Tracker

## Overview

Build and verify the production-grade TRAX real-time vehicle tracking application, covering the Node.js/Express/Socket.io backend, the single-page web client with GPS and cell-tower fallback, offline resilience, session persistence, map visualisation, and documentation.

## Tasks

- [x] 1. Verify and complete server.js
  - Confirm helmet, compression, morgan, cors, and express-rate-limit middleware are applied in the correct order
  - Confirm POST /api/location validates busId format, lat/lng values, and returns correct HTTP status codes and bodies
  - Confirm GET /api/bus/:busId/location returns 200+BusState when found, 404 when missing, 400 for invalid busId format
  - Confirm BusState Map stores history capped at 5 entries, TTL timer resets on each update, TTL expiry deletes entry and emits busExpired to the BusRoom
  - Confirm Socket.io subscribe/unsubscribe room management, initialState event on connect, automatic room leave on client disconnect
  - Confirm graceful shutdown: SIGINT/SIGTERM stops accepting new connections, 5-second force-kill timeout destroys remaining connections
  - **Files**: `server.js`

- [x] 2. Verify and complete public/index.html
  - Confirm navigator.geolocation.watchPosition is called with enableHighAccuracy:true, timeout:10000, maximumAge:1000 on Start
  - Confirm GPS errors trigger cell tower fallback; PERMISSION_DENIED switches immediately without retrying GPS
  - Confirm cell tower simulation uses the four mock tower coordinates (NW/NE/SW/SE around Lucknow), adds Gaussian noise of ±0.005°, sets accuracy to 500–2000m, and sets source to "cell"
  - Confirm Force Cell Tower button calls clearWatch before switching when GPS watch is active
  - Confirm offline queue uses localStorage key trax_offline_queue, caps at 50 entries with FIFO eviction, retries on a 10-second flush interval, removes entries on successful retry
  - Confirm session restore: trax_bus_id pre-populates input on load; trax_last_location renders cached marker and shows the session-restore message
  - Confirm Leaflet map centred on Lucknow (26.8467, 80.9462) at zoom 13; markers move with smooth 500ms CSS transitions; trail polylines update through the last 5 history positions; accuracy circles appear for cell source and are removed for GPS source; marker popups show busId, coordinates to 5 decimal places, source, accuracy, and timestamp
  - Confirm Socket.io client config: reconnection:true, reconnectionDelay:1000, reconnectionDelayMax:30000, reconnectionAttempts:Infinity, re-emits subscribe for current busId on reconnect
  - Confirm status panel accurately reflects tracking state, source badge, accuracy in metres, last-update timestamp in local time, and WebSocket connection status
  - Confirm Stop button calls clearWatch and cancels the send interval
  - **Files**: `public/index.html`

- [x] 3. Verify README.md completeness
  - Confirm npm install and npm start commands are present in an installation section
  - Confirm PORT and CORS_ORIGIN environment variables are documented with defaults
  - Confirm both REST endpoints are documented with example request and response JSON bodies
  - Confirm Socket.io events emitted by the server (initialState, locationUpdate, busExpired) and events expected from clients (subscribe, unsubscribe) are documented
  - Confirm a section explains the cell tower fallback simulation and how to trigger it with the Force Cell Tower button
  - **Files**: `README.md`

- [x] 4. Verify package.json configuration
  - Confirm express, socket.io, cors, helmet, compression, morgan, and express-rate-limit are listed as dependencies with exact pinned versions
  - Confirm the "start" script executes "node server.js" and "main" is set to "server.js"
  - **Files**: `package.json`

- [x] 5. Install dependencies and start the server to confirm the application runs
  - Run npm install to install all declared dependencies
  - Run npm start and confirm the server listens on port 3000 and serves public/index.html at the root URL
  - **Files**: `server.js`, `package.json`

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2", "3", "4"] },
    { "wave": 2, "tasks": ["5"] }
  ]
}
```

## Notes

The existing partial implementation (server.js and public/index.html) is substantially complete. Tasks 1–4 verify correctness against requirements and patch any gaps. Task 5 is the final smoke-test that confirms everything runs together.

