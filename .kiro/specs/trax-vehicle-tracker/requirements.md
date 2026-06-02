# Requirements Document

## Introduction

TRAX is a production-grade, real-time vehicle tracking web application that uses crowdsourcing as its primary location source and simulated cell tower triangulation as a fallback. The system allows passengers or drivers to share a vehicle's live GPS location from a browser, broadcasts updates to all subscribed viewers via WebSockets, and degrades gracefully when GPS is unavailable. The application is mobile-first, offline-resilient, and requires no database — all state is held in-memory on the server with TTL-based cleanup.

The existing partial implementation (basic Express + Socket.io server, basic GPS tracking frontend) must be replaced with a complete, production-grade implementation covering all deliverables: `package.json`, `server.js`, `public/index.html`, and `README.md`.

---

## Glossary

- **TRAX**: The vehicle tracking web application being specified.
- **Tracker**: The browser client that shares a vehicle's live location (passenger or driver phone).
- **Viewer**: Any browser client that observes vehicle locations on the map without sharing location.
- **Server**: The Node.js + Express + Socket.io backend process.
- **BusId**: A unique alphanumeric identifier for a tracked vehicle (e.g., "BUS-101"), max 20 characters.
- **LocationPayload**: A JSON object containing `busId`, `lat`, `lng`, `source`, `accuracy`, and `timestamp`.
- **GPS_Source**: A location reading obtained from `navigator.geolocation.watchPosition` with source value `"gps"`.
- **Cell_Source**: A simulated location reading produced by the trilateration algorithm with source value `"cell"`.
- **BusRoom**: A Socket.io room named after a BusId; all clients subscribed to a vehicle join this room.
- **BusState**: The in-memory server-side record for a vehicle containing its latest LocationPayload, position history (last 5), and TTL timer.
- **TTL**: Time-to-live; a vehicle's BusState is removed from memory 30 seconds after the last location update.
- **OfflineQueue**: A localStorage-backed list of LocationPayloads that failed to POST and are pending retry.
- **Trail**: A Leaflet polyline drawn through the last 5 positions of a vehicle on the map.
- **AccuracyCircle**: A Leaflet circle drawn around a vehicle marker to visualise the estimated position error radius.
- **Trilateration**: The geometric algorithm used to estimate position from distances to three or more reference points (mock cell towers).
- **MockTower**: One of four fixed reference coordinates around Lucknow (26.8467°N, 80.9462°E) used to simulate cell tower triangulation.

---

## Requirements

### Requirement 1: Dependency and Project Configuration

**User Story:** As a developer, I want a complete `package.json` with all required production dependencies and a `start` script, so that I can install and run the application with a single command.

#### Acceptance Criteria

1. THE `package.json` SHALL declare exact pinned versions for the following runtime dependencies: `express`, `socket.io`, `cors`, `helmet`, `compression`, `morgan`, and `express-rate-limit`.
2. THE `package.json` SHALL include a `"start"` script that executes `node server.js`.
3. THE `package.json` SHALL set `"main"` to `"server.js"`.
4. WHEN `npm install` is run, THE project SHALL install all declared dependencies without errors.

---

### Requirement 2: HTTP Server and Middleware Stack

**User Story:** As a developer, I want the server to apply security, compression, logging, and CORS middleware, so that the application is production-hardened from the first request.

#### Acceptance Criteria

1. THE Server SHALL apply `helmet` middleware to set secure HTTP response headers on every response.
2. THE Server SHALL apply `compression` middleware to gzip-compress HTTP responses where the client supports it.
3. THE Server SHALL apply `morgan` middleware in `"combined"` format to log every HTTP request to stdout.
4. THE Server SHALL apply `cors` middleware to allow cross-origin requests from any origin (configurable via `CORS_ORIGIN` environment variable, defaulting to `"*"`).
5. THE Server SHALL serve all files in the `public/` directory as static assets.
6. THE Server SHALL listen on the port specified by the `PORT` environment variable, defaulting to `3000`.
7. WHEN the Server receives `SIGINT` or `SIGTERM`, THE Server SHALL stop accepting new connections, close all active connections, and exit with code `0`; IF active connections have not closed within 5 seconds, THE Server SHALL force-terminate remaining connections and exit.

---

### Requirement 3: Rate Limiting

**User Story:** As an operator, I want API endpoints to be rate-limited, so that a single client cannot flood the server with requests.

#### Acceptance Criteria

1. THE Server SHALL apply `express-rate-limit` to all routes under `/api/`.
2. WHEN a client sends more than 10 requests within a 1-second window to any `/api/` route, THE Server SHALL respond with HTTP status `429` and a JSON body `{ "error": "Too many requests" }`.
3. THE rate limiter SHALL use the client's IP address as the key.

---

### Requirement 4: POST /api/location Endpoint

**User Story:** As a Tracker, I want to POST my vehicle's location to the server, so that the server can store it and broadcast it to all Viewers.

#### Acceptance Criteria

1. WHEN a valid LocationPayload is received at `POST /api/location`, THE Server SHALL respond with HTTP status `200` and a JSON body containing `{ "status": "ok", "busId": "<busId>", "latest": <LocationPayload> }`.
2. WHEN the request body is missing `busId`, THE Server SHALL respond with HTTP status `400` and `{ "error": "busId is required" }`.
3. WHEN `busId` contains characters other than alphanumeric characters and hyphens, or exceeds 20 characters, THE Server SHALL respond with HTTP status `400` and `{ "error": "busId must be alphanumeric (hyphens allowed), max 20 characters" }`.
4. WHEN `lat` or `lng` are absent or not finite numbers, THE Server SHALL respond with HTTP status `400` and `{ "error": "lat and lng must be finite numbers" }`.
5. WHEN `lat` is outside the range `[-90, 90]` or `lng` is outside `[-180, 180]`, THE Server SHALL respond with HTTP status `400` and `{ "error": "lat/lng out of valid range" }`.
6. WHEN a valid LocationPayload is received, THE Server SHALL update the BusState for that BusId, appending the new position to the history and capping history at 5 entries.
7. WHEN a valid LocationPayload is received, THE Server SHALL reset the TTL timer for that BusId to 30 seconds.
8. WHEN a valid LocationPayload is received, THE Server SHALL emit a `"locationUpdate"` Socket.io event to the BusRoom named after the BusId, carrying the updated BusState.

---

### Requirement 5: GET /api/bus/:busId/location Endpoint

**User Story:** As a Viewer, I want to fetch the latest known location of a specific vehicle via REST, so that I can display it without requiring a WebSocket connection.

#### Acceptance Criteria

1. WHEN `GET /api/bus/:busId/location` is called for a BusId that exists in memory, THE Server SHALL respond with HTTP status `200` and the current BusState JSON.
2. WHEN `GET /api/bus/:busId/location` is called for a BusId that does not exist in memory and the BusId passes format validation, THE Server SHALL respond with HTTP status `404` and `{ "error": "Bus not found" }`.
3. WHEN `busId` in the URL path fails the alphanumeric-plus-hyphens, max-20-characters validation, THE Server SHALL respond with HTTP status `400` and `{ "error": "Invalid busId format" }` regardless of whether the BusId exists in memory.

---

### Requirement 6: In-Memory State and TTL Cleanup

**User Story:** As an operator, I want stale vehicle records to be automatically removed from memory, so that the server does not accumulate unbounded state.

#### Acceptance Criteria

1. THE Server SHALL store all active BusState records in a `Map` keyed by BusId.
2. WHEN a BusId's TTL timer expires (30 seconds after the last location update), THE Server SHALL delete that BusId's entry from the Map.
3. WHEN a BusId's entry is deleted due to TTL expiry, THE Server SHALL emit a `"busExpired"` Socket.io event to the BusRoom for that BusId, carrying `{ "busId": "<busId>" }`.
4. WHEN a new location update is received for a BusId whose entry was previously expired, THE Server SHALL create a new BusState entry for that BusId.

---

### Requirement 7: WebSocket Room Management

**User Story:** As a Viewer, I want to subscribe to a specific vehicle's updates, so that I only receive Socket.io events relevant to the vehicle I am watching.

#### Acceptance Criteria

1. WHEN a Socket.io client emits `"subscribe"` with `{ "busId": "<busId>" }`, THE Server SHALL add that socket to the BusRoom named after the BusId.
2. WHEN a Socket.io client emits `"unsubscribe"` with `{ "busId": "<busId>" }`, THE Server SHALL remove that socket from the BusRoom named after the BusId.
3. WHEN a Socket.io client connects, THE Server SHALL emit an `"initialState"` event to that socket containing the full current Map of all active BusState records.
4. WHEN a Socket.io client disconnects, THE Server SHALL automatically remove it from all BusRooms it had joined.

---

### Requirement 8: GPS-Based Location Tracking (Tracker Client)

**User Story:** As a Tracker, I want the browser to continuously read my GPS position and send it to the server, so that my vehicle's location is kept up to date in real time.

#### Acceptance Criteria

1. WHEN the Tracker clicks "Start Tracking" and GPS permission is granted, THE Tracker SHALL call `navigator.geolocation.watchPosition` with `enableHighAccuracy: true`, `timeout: 10000`, and `maximumAge: 1000`.
2. WHEN a new GPS position is received, THE Tracker SHALL update `currentLocation` with `lat`, `lng`, `accuracy`, and `source: "gps"`.
3. THE Tracker SHALL send a LocationPayload to `POST /api/location` at an interval of 3 seconds while tracking is active.
4. WHEN the Tracker sends a LocationPayload, THE Tracker SHALL include `busId`, `lat`, `lng`, `source`, `accuracy`, and an ISO 8601 `timestamp`.
5. WHEN the Tracker is stopped, THE Tracker SHALL call `navigator.geolocation.clearWatch` and cancel the send interval.

---

### Requirement 9: Cell Tower Triangulation Fallback

**User Story:** As a Tracker, I want the application to automatically fall back to a simulated cell tower location when GPS is unavailable, so that tracking continues even without GPS permission.

#### Acceptance Criteria

1. WHEN `navigator.geolocation.watchPosition` calls the error callback with any error code, THE Tracker SHALL switch to Cell_Source mode.
2. WHEN GPS permission is denied (`PERMISSION_DENIED` error code `1`), THE Tracker SHALL immediately switch to Cell_Source mode without retrying GPS.
3. WHEN GPS is unavailable (`POSITION_UNAVAILABLE` error code `2`) or times out (`TIMEOUT` error code `3`), THE Tracker SHALL switch to Cell_Source mode.
4. THE Tracker SHALL simulate trilateration using 4 MockTowers at fixed offsets around Lucknow (26.8467°N, 80.9462°E): NW (+0.045°N, −0.060°E), NE (+0.045°N, +0.060°E), SW (−0.045°N, −0.060°E), SE (−0.045°N, +0.060°E).
5. WHEN computing a Cell_Source position, THE Tracker SHALL add Gaussian noise of ±0.005° to both lat and lng to simulate real-world inaccuracy.
6. WHEN computing a Cell_Source position, THE Tracker SHALL set `accuracy` to a random value between 500 and 2000 metres.
7. WHEN computing a Cell_Source position, THE Tracker SHALL set `source` to `"cell"`.
8. WHEN the Tracker is in Cell_Source mode, THE Tracker SHALL display the label "Cell Tower Fallback (approx)" in the status panel.
9. THE Tracker UI SHALL include a "Force Cell Tower" button that, when clicked, immediately switches to Cell_Source mode regardless of GPS availability.
10. WHEN the "Force Cell Tower" button is clicked while GPS tracking is active, THE Tracker SHALL call `navigator.geolocation.clearWatch` before switching to Cell_Source mode.

---

### Requirement 10: BusId Validation (Client-Side)

**User Story:** As a Tracker, I want the application to validate the bus number I enter before starting tracking, so that invalid identifiers are rejected before any network request is made.

#### Acceptance Criteria

1. WHEN the Tracker clicks "Start Tracking" and the BusId field is empty, THE Tracker SHALL display the error "Please enter a bus number." and not start tracking.
2. WHEN the Tracker clicks "Start Tracking" and the BusId field is non-empty but contains characters other than alphanumeric characters and hyphens, THE Tracker SHALL display the error "Bus ID must be alphanumeric (hyphens allowed)." and not start tracking.
3. WHEN the Tracker clicks "Start Tracking" and the BusId field is non-empty, passes character validation, but exceeds 20 characters, THE Tracker SHALL display the error "Bus ID must be 20 characters or fewer." and not start tracking.
4. WHEN the BusId is non-empty, contains only alphanumeric characters and hyphens, and is 20 characters or fewer, THE Tracker SHALL proceed to start tracking.

---

### Requirement 11: Map Visualisation

**User Story:** As a Viewer, I want to see vehicles on an interactive map with smooth movement, a position trail, and an accuracy indicator, so that I can understand each vehicle's location and confidence level at a glance.

#### Acceptance Criteria

1. THE Tracker SHALL initialise a Leaflet map centred on Lucknow (26.8467°N, 80.9462°E) at zoom level 13 using OpenStreetMap tiles.
2. WHEN a `"locationUpdate"` Socket.io event is received for a BusId that already has a marker on the map, THE Tracker SHALL move the existing marker to the new coordinates using a smooth CSS transition animation of 500ms.
3. WHEN a `"locationUpdate"` Socket.io event is received for a BusId that does not yet have a marker on the map, THE Tracker SHALL create a new Leaflet marker at the received coordinates.
4. THE Tracker SHALL maintain a Leaflet polyline (Trail) for each BusId, drawn through the last 5 positions in the BusState history.
5. WHEN a `"locationUpdate"` is received, THE Tracker SHALL update the Trail polyline to reflect the latest history.
6. WHEN the location source is `"cell"`, THE Tracker SHALL display an AccuracyCircle centred on the marker with radius exactly equal to the `accuracy` value in metres.
7. WHEN the location source is `"gps"`, THE Tracker SHALL remove any existing AccuracyCircle for that BusId.
8. WHEN a `"busExpired"` Socket.io event is received, THE Tracker SHALL remove the marker, Trail, and AccuracyCircle for that BusId from the map.
9. WHEN a marker is clicked, THE Tracker SHALL open a popup showing BusId, coordinates (5 decimal places), source, accuracy, and last update time.

---

### Requirement 12: Status Panel

**User Story:** As a Tracker, I want a real-time status panel that shows all relevant tracking information, so that I can confirm the system is working correctly at a glance.

#### Acceptance Criteria

1. THE status panel SHALL display the current tracking state: "Tracking Active" or "Tracking Stopped".
2. THE status panel SHALL display the current location source: "GPS" or "Cell Tower Fallback".
3. THE status panel SHALL display the current accuracy in metres (e.g., "±42m" for GPS, "±1400m" for cell).
4. THE status panel SHALL display the timestamp of the last successful location update in local time format.
5. THE status panel SHALL display the current WebSocket connection status: "Connected" or "Disconnected".
6. WHEN the WebSocket disconnects, THE status panel SHALL update the WebSocket status field to "Disconnected" within 1 second.
7. WHEN the WebSocket reconnects, THE status panel SHALL update the WebSocket status field to "Connected" within 1 second.

---

### Requirement 13: Offline Resilience and Request Queuing

**User Story:** As a Tracker, I want failed location POSTs to be queued and retried automatically, so that location data is not lost during brief network outages.

#### Acceptance Criteria

1. WHEN a `POST /api/location` request fails due to a network error, THE Tracker SHALL append the LocationPayload to the OfflineQueue stored in localStorage under the key `"trax_offline_queue"`.
2. WHEN the OfflineQueue contains entries and the network is available, THE Tracker SHALL attempt to flush the queue by POSTing each entry in order.
3. WHEN a queued entry is successfully POSTed, THE Tracker SHALL remove it from the OfflineQueue.
4. WHEN a queued entry fails to POST again, THE Tracker SHALL leave it in the OfflineQueue and retry on the next flush cycle.
5. THE Tracker SHALL attempt to flush the OfflineQueue every 10 seconds while tracking is active.
6. THE OfflineQueue SHALL be capped at 50 entries; WHEN the cap is reached, THE Tracker SHALL discard the oldest entry before appending a new one.

---

### Requirement 14: Session Persistence

**User Story:** As a Tracker, I want the application to restore my last known vehicle and location on page reload, so that I do not lose context after an accidental refresh.

#### Acceptance Criteria

1. WHEN the Tracker successfully sends a LocationPayload, THE Tracker SHALL attempt to persist the `busId` to localStorage under the key `"trax_bus_id"`; IF localStorage write fails, THE Tracker SHALL continue sending without interruption.
2. WHEN the Tracker successfully sends a LocationPayload, THE Tracker SHALL persist the latest LocationPayload to localStorage under the key `"trax_last_location"`.
3. WHEN the page loads, THE Tracker SHALL read `"trax_bus_id"` from localStorage and pre-populate the BusId input field if the value is present.
4. WHEN the page loads and `"trax_last_location"` is present in localStorage, THE Tracker SHALL render the cached marker on the map and display "Loaded cached location from previous session. Tap Start to resume." in the status panel.

---

### Requirement 15: Mobile-First Responsive UI

**User Story:** As a mobile user, I want the interface to be fully usable on a small touchscreen, so that passengers and drivers can use it on their phones without difficulty.

#### Acceptance Criteria

1. THE HTML document SHALL include `<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">`.
2. THE Tracker UI SHALL render all interactive controls (BusId input, Start, Stop, Force Cell Tower buttons) in a single column on viewports narrower than 640px.
3. ALL touch targets (buttons, inputs) SHALL have a minimum height of 44px and minimum width of 44px.
4. THE map SHALL occupy at least 52% of the viewport height on mobile viewports.
5. THE Tracker UI SHALL use a dark colour scheme with sufficient contrast (WCAG AA minimum) for outdoor readability.

---

### Requirement 16: Socket.io Auto-Reconnect

**User Story:** As a Tracker, I want the Socket.io client to automatically reconnect after a disconnection, so that real-time updates resume without requiring a page reload.

#### Acceptance Criteria

1. THE Socket.io client SHALL be configured with `reconnection: true`.
2. THE Socket.io client SHALL use exponential backoff for reconnection attempts, starting at 1 second and capping at 30 seconds.
3. THE Socket.io client SHALL attempt reconnection indefinitely (`reconnectionAttempts: Infinity`).
4. WHEN the Socket.io client reconnects, THE Tracker SHALL re-emit `"subscribe"` for the currently tracked BusId to rejoin the BusRoom.

---

### Requirement 17: Parser and Serialisation Round-Trip

**User Story:** As a developer, I want all JSON serialisation and deserialisation of LocationPayload objects to be lossless, so that location data is not corrupted in transit or storage.

#### Acceptance Criteria

1. THE Server SHALL parse incoming `POST /api/location` request bodies as JSON using `express.json()`.
2. WHEN a LocationPayload is serialised to JSON and then deserialised, THE resulting object SHALL have `lat` and `lng` values equal to the originals within floating-point precision (delta ≤ 1e-9 degrees).
3. WHEN a LocationPayload is stored in localStorage and then read back, THE `lat`, `lng`, `accuracy`, `source`, `busId`, and `timestamp` fields SHALL all be present and equal to the stored values.
4. FOR ALL valid LocationPayload objects, serialising to JSON string and parsing back SHALL produce an object with identical `busId`, `lat`, `lng`, `source`, and `accuracy` fields (round-trip property).

---

### Requirement 18: README Documentation

**User Story:** As a developer, I want a README that explains how to install, configure, and run TRAX, so that I can get the application running in under 5 minutes.

#### Acceptance Criteria

1. THE `README.md` SHALL include an installation section with the exact commands `npm install` and `npm start`.
2. THE `README.md` SHALL document all supported environment variables: `PORT` and `CORS_ORIGIN`.
3. THE `README.md` SHALL describe the two REST endpoints (`POST /api/location`, `GET /api/bus/:busId/location`) with example request and response bodies.
4. THE `README.md` SHALL describe the Socket.io events emitted by the server (`initialState`, `locationUpdate`, `busExpired`) and the events expected from clients (`subscribe`, `unsubscribe`).
5. THE `README.md` SHALL include a section explaining the cell tower fallback simulation and how to trigger it using the "Force Cell Tower" button.
