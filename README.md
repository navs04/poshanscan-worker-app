# poshanscan-worker-app

Field worker PWA for PoshanScan (Member 3). React + Vite + TypeScript + Tailwind.
Talks to **Repo 2 (backend) only**. It never calls the CV service directly.

## Status

| Verified | Not yet verified |
| --- | --- |
| Sign in, child search, scan and result against the real backend (with `MOCK_CV=True`, so the result is fake) | Real MUAC results (needs the CV service and a real arm + marker photo) |
| Offline scan saved to the queue, then sent automatically when back online | Several queued scans in one go (batches of 5), and that the server stores each exactly once |
| Full flow against the mock server, including rejected scans and retake | The live camera on a real phone, PWA install, opening with no network |
| Production build (`npm run build`) passes and the app is deployed on Vercel | The deployed app talking to the deployed backend (waiting for the Render URL) |

## Live deployment

| | URL | State |
| --- | --- | --- |
| Worker app (Vercel) | `<paste your Vercel URL here>` | Deployed |
| Backend (Render) | `<paste the Render URL here once it exists>` | Waiting for the backend owner |

`VITE_API_BASE_URL` on Vercel is currently a placeholder, so sign-in on the deployed app fails until it is set to the real
backend URL. Once the Render URL exists: Vercel, *Settings, Environment Variables*, edit `VITE_API_BASE_URL`, then **redeploy**.

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

### With the real backend

Follow the backend repo's README. On Ubuntu/WSL the commands need `python3` until the virtual environment is active:

```bash
python3 -m venv venv
source venv/bin/activate        # every new terminal needs this again
pip install -r requirements.txt
cp .env.example .env            # keep MOCK_CV=True until the CV service is live
python seed.py                  # creates 9876543210 / worker123 and sample children
uvicorn app.main:app --reload --port 8000
```

Then:

1. **Stop `npm run mock`.** It and the backend both use port 8000.
2. Keep `VITE_API_BASE_URL=http://localhost:8000` and restart `npm run dev` (Vite reads `.env` only at startup).
3. The backend must allow `http://localhost:5173` in its CORS settings and accept the `Authorization` header.
   Quick check:
   ```bash
   curl -i -X OPTIONS http://localhost:8000/auth/login -H "Origin: http://localhost:5173" \
     -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type,authorization"
   ```
   The response must contain `access-control-allow-origin`.

Opening `http://localhost:8000` in a browser shows `{"detail":"Not authenticated"}`. That is normal: only `/auth/login`
is open, everything else needs the token the app sends after you sign in.

### Desktop without a webcam

- Click **Phone camera** on the capture screen and pick any image file. The whole flow works the same.
  With `MOCK_CV=True` any image gives a fake result. Once the real CV service is on, a screenshot is rejected
  with the "retake" message, which is also a useful test.
- For the live overlay, run Chrome with a fake camera (close all Chrome windows first):
  ```bash
  google-chrome --user-data-dir=/tmp/chrome-test --use-fake-device-for-media-stream \
    --use-fake-ui-for-media-stream http://localhost:5173
  ```
- In **WSL**, webcams are not visible at all. Open `http://localhost:5173` in the Windows browser instead.
- Browsers may offer to install the app (it is a PWA). You can ignore that on a laptop.

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
2. Set `VITE_API_BASE_URL` in the project's environment variables. You can deploy before the backend exists:
   use a placeholder such as `https://example.com` (the app loads, sign-in fails until the real URL is set).
3. **Changing an environment variable needs a redeploy.** Vite bakes it in at build time.
4. The backend URL must be **https** (browsers block an https page from calling an http API).
5. Ask the backend owner to add the Vercel URL to their **CORS allowed origins**.
6. The free Render backend sleeps after ~15 minutes idle and takes 30-50 s to wake. The app shows a
   "server is waking up" hint, but open the backend URL a minute before any demo.
7. The deployed backend needs its own database with the seeded worker account and children. Seed data from a local
   `seed.py` run does not carry over.

### Checklist for the backend owner (send with the Vercel URL)

- [ ] Add the Vercel URL (and `http://localhost:5173`) to CORS allowed origins; allow the `Authorization` header and `GET`/`POST`.
- [ ] Connect the deployed backend to an online database and run the seed (`9876543210` / `worker123` plus sample children).
- [ ] Keep `MOCK_CV=True` until the CV service is live, then set `CV_SERVICE_URL` and switch it off.
- [ ] Send back the Render URL (`https://...onrender.com`, no trailing path).
- [ ] Confirm a scan retried after a timeout is stored once (`client_scan_id`), and `/sync` returns results in request order.

On Android Chrome the worker taps *Add to Home screen* / *Install app*. The app shell is precached, so it opens with no
network. Test install and offline on a production build (`npm run build && npm run preview`, or the Vercel URL), not
on the dev server.

`package-lock.json` is committed on purpose so everyone, and Vercel, installs the same versions.

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

**Status:** the offline queue and `/sync` have been run end to end against the real backend. Still worth checking with
the backend owner: that a scan retried after a timeout is stored **once** (de-duplicated by `client_scan_id`), and that
`/sync` returns results in request order.

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
- [x] Take a photo, see the result, needle on the right zone, band and confidence correct (fake CV result).
- [x] Airplane mode: search a known child, take a photo, see "Saved on this phone", badge shows 1.
- [x] Turn the network back on: toast says the scan was sent, badge disappears, it appears under Recent screenings.
- [ ] `MOCK_FAIL=1`: a rejected capture asks for a retake; a rejected queued scan shows under Unsent scans with the reason.
- [ ] Install to the home screen, close the app, reopen with no network: it still opens and you are still signed in.
- [ ] Sign out with unsent scans: confirmation appears, scans are still there after signing back in.

## Next steps

- [ ] Queue 6-7 scans offline and check both batches arrive once, in order.
- [x] Deploy to Vercel.
- [ ] Set `VITE_API_BASE_URL` to the Render URL and redeploy, then test sign-in and a scan on the deployed app.
- [ ] Test on a real phone: live camera, install to home screen, open with no network.
- [ ] Tune `VITE_MIN_SHARPNESS` with real arm photos on the demo phone.
- [ ] When the CV service is live (`MOCK_CV=False`), re-test with real arm + marker photos and the retake message.
- [ ] Optional: camera errors that name the real cause, Hindi labels, a tape-measurement field for evaluation data.