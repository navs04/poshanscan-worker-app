# poshanscan-worker-app

Field worker PWA for PoshanScan (Member 3). React + Vite + TypeScript + Tailwind.
Talks to **Repo 2 (backend) only**. It never calls the CV service directly.

## What it does

| Screen | What the worker does |
| --- | --- |
| Login | Phone + password, JWT stored on the phone. Supervisor accounts are refused (they use the dashboard). |
| Find a child | Debounced search. Falls back to children cached on the phone when offline. Shows recently used children and recent screenings. |
| Register a child | Name, DOB (age shown live, warns outside 6-59 months), gender, guardian, village. Remembers the last village. |
| Capture | Rear camera with an arm + reference-marker overlay, live "Hold steady / Too dark / Too bright" feedback, shutter. Fallback: phone camera app via file input. |
| Review | Client-side blur + brightness check on the photo before upload. Retake, or "use anyway". |
| Result | MUAC in mm on a red/yellow/green tape with a needle, screening band, confidence, recommended actions, screening-aid disclaimer. Low confidence tells the worker to re-measure. |
| Unsent scans | Photos saved offline, per-item status, send now, retry, delete. |

Offline: if there is no connection (or the request times out) the photo is saved to IndexedDB and uploaded
automatically when the phone is back online (`online` event, app foregrounded, every 30 s while anything waits).
A scan the server rejects is marked **rejected** and never blocks the others.

## Run locally

```bash
npm install
cp .env.example .env

# Terminal 1: stand-in for Member 2's backend (no dependencies)
npm run mock              # http://localhost:8000
# MOCK_FAIL=1 npm run mock   -> ~25% of scans fail with 422 (test retake + rejected flows)

# Terminal 2
npm run dev               # http://localhost:5173
```

Mock login: `9876543210` / `worker123`. (`9000000000` / `super123` is a supervisor and must be refused.)

To use the real backend instead, run `docker-compose up` in Member 2's repo and keep
`VITE_API_BASE_URL=http://localhost:8000`, or point it at the deployed Render URL.

### Testing the camera on a real phone

`getUserMedia` only works on **https** or `localhost`. Plain `http://192.168.x.x:5173` will not open the camera
(the "Phone camera" button still works). Two easy options:

1. **USB port forwarding:** phone connected, Chrome on desktop, open `chrome://inspect#devices`, tick
   *Port forwarding*, forward `5173` and `8000` to `localhost:5173` / `localhost:8000`, then open
   `http://localhost:5173` on the phone.
2. **Deploy a Vercel preview** (see below) and open the https URL.

## Scripts

| Command | |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check, then production build to `dist/` (also generates the service worker) |
| `npm run preview` | Serve the production build (use this to test install + offline) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run mock` | Mock backend implementing the frozen contract |

## Configuration (`.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend base URL |
| `VITE_REFERENCE_TYPE` | `aruco` | `aruco` / `coin` / `card`. Sent with each scan and shown in the overlay |
| `VITE_REFERENCE_SIZE_MM` | `50` | Physical size of the reference object |
| `VITE_MIN_SHARPNESS` | `40` | Blur threshold (variance of Laplacian). **Tune it, see below** |

Other knobs live in `src/lib/config.ts` (timeouts, confidence thresholds, sync batch size, brightness limits).

## Deploy (Vercel)

1. Import the repo, framework preset **Vite**. `vercel.json` already rewrites all routes to `index.html`.
2. Set `VITE_API_BASE_URL` (and the reference vars) in the project's environment variables.
3. Ask Member 2 to add the Vercel URL to the backend's **CORS allowed origins**.

On Android Chrome the worker taps *Add to Home screen* / *Install app*. The app shell is precached, so it opens with no network.

## Things Member 2 must confirm (assumptions beyond the frozen contract)

The contract fixes `/auth/login`, `/children`, `/scans` and the *shape* of `/sync` results. It does not say how `/sync`
carries images or how offline scans are de-duplicated, so the app assumes the following. All of it lives in
`src/lib/api.ts`, so changing it is a one-file edit.

1. **`POST /scans`** (multipart) sends `image`, `child_id`, `worker_id` as agreed, **plus** `client_scan_id`
   (UUID made on the phone), `captured_at` (ISO), `reference_type`, `reference_size_mm`.
   `reference_*` are what the backend should forward to `/infer`. `client_scan_id` should be unique in the DB so a
   retried request after a timeout does not create a duplicate scan.
2. **`POST /sync`** (multipart): field `metadata` = JSON array
   `[{client_scan_id, child_id, worker_id, captured_at, reference_type, reference_size_mm}]`, field `images` = one file
   per entry in the same order (FastAPI: `images: list[UploadFile]`). Max 5 scans per call.
3. **`/sync` response**: array in the same order, each item the normal scan result **plus `client_scan_id`**. A failed
   item is `{ "error": "reference_object_not_detected", "message": "...", "client_scan_id": "..." }` instead of failing
   the whole request. (If the whole call returns a 4xx the app retries the scans one by one.)
4. **Error bodies**: either `{error, message}` or FastAPI's `{detail: "..."}` / `{detail: {error, message}}` are understood.
   `422` on `/scans` = "bad capture, retake". `401` anywhere = the app signs the worker out (queued scans stay on the phone).
5. **Child fields**: `child_id`, `name`, `dob` (`YYYY-MM-DD`), `gender` (`M`/`F`/`O`), `guardian_name`, `village`.
   `GET /children/search` returns a JSON array. `POST /children` returns the created child including `child_id`.
6. **`risk_band`** is accepted in any case (`MAM` / `mam`); the app upper-cases it.
7. **CORS** must allow the `Authorization` header and the app's origin.

**Known limitation:** registering a child needs a connection, because the child id comes from the server.
Offline scans for children already on the phone work. To allow offline registration, the contract would need
client-generated `child_id`s and an upsert endpoint.

## Tuning the blur check (do this with real photos)

The client-side check is a cheap heuristic: bare skin has few edges, so a sharp photo of an arm can score low.
Take 20 sharp and 20 slightly blurred test photos on the target phones, read the values from `analyseLuma`
(`sharpness`, `brightness`), and set `VITE_MIN_SHARPNESS` between the two groups. The worker can always choose
*Use this photo anyway*, and the CV service does the authoritative quality check.

## Project layout

```
src/
  pages/        Login, ChildSearch, RegisterChild, Capture, Result, Queue
  components/   CameraOverlay, MuacTape, Layout, ActionBar, Alert, Toast, ChildRow, icons, ...
  context/      AuthContext (session + 401 handling), SyncContext (online state, queue count, auto-sync)
  hooks/        useCamera (getUserMedia, StrictMode-safe)
  lib/
    api.ts            the only file that knows the backend URLs and shapes
    offlineQueue.ts   IndexedDB queue + batched sync + rejected-scan isolation
    db.ts             idb schema: children cache, queue, history
    imageQuality.ts   blur / brightness maths (pure, DOM-free core)
    image.ts          shrinks big photos from the phone camera app
    risk.ts           WHO cut-offs, band text and colours, recommended actions
    config.ts         env + tunables
mock-server/server.mjs   contract-faithful fake backend
public/manifest.json     PWA manifest, icons in public/icons
```

## Manual test checklist (for the demo)

- [ ] Sign in; wrong password shows an error; supervisor account is refused.
- [ ] Register a child, then land on the camera.
- [ ] Take a photo, see the result, needle on the right zone, band and confidence correct.
- [ ] Airplane mode: search a known child, take a photo, see "Saved on this phone", badge shows 1.
- [ ] Turn the network back on: toast says the scan was sent, badge disappears, it appears under Recent screenings.
- [ ] `MOCK_FAIL=1`: a rejected capture asks for a retake; a rejected queued scan shows under Unsent scans with the reason.
- [ ] Install to the home screen, close the app, reopen with no network: it still opens and you are still signed in.
- [ ] Sign out with unsent scans: confirmation appears, scans are still there after signing back in.
