# TRAX – Edit/Build Checklist

- [x] Read existing files: `server.js`, `index.html`, `package.json`, `PROJECT_DOCUMENT.md`
- [x] Search for cell-tower/OpenCellID references
- [x] Update `index.html` legend + busId persistence + history timestamp handling
- [ ] Add OpenCellID-based cell triangulation (mock first) into frontend fallback flow
- [ ] Ensure `getBusId()` fallback behavior is consistent everywhere (avoid empty busId)
- [ ] (Optional MVP) Add `POST /api/location` validation and timestamp normalization in `server.js`
- [ ] Verify `package.json` scripts/deps
- [ ] Provide step-by-step run instructions

Status: Frontend MVP updated; backend already matches requirements for MVP (in-memory, no DB).
