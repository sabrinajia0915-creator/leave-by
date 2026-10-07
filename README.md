# Leave By

Work backward from any appointment, reservation or class. Enter when it starts and where it is, and Leave By tells you:

- **when to start getting ready**
- **when to leave** (using real travel time from Google Maps, with predicted traffic for driving and real schedules for transit)
- **when you'll arrive**, with the buffer you asked for

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. Without an API key the app still works: you type the travel time yourself.

## How Google Maps is connected

The browser never talks to Google directly. It calls two small server functions in `api/`, and those call Google with a key that only the server knows:

```
Browser ──▶ /api/autocomplete, /api/route (Vercel functions) ──▶ Google
```

- `api/autocomplete.ts`: address suggestions (Places API (New))
- `api/route.ts`: travel time (Routes API)
- Both reject requests from other websites, check their input, and limit how many requests each visitor can make. Google quotas and a billing budget are the final safety net.

`npm run dev` runs these functions locally too.

## Turn on Google Maps travel times

1. Go to <https://console.cloud.google.com/> and create a project with billing set up. Normal personal use stays inside Google's monthly free usage.
2. Under **APIs & Services → Library**, enable **Places API (New)** and **Routes API**.
3. Under **APIs & Services → Credentials**, click **Create credentials → API key**, then edit it:
   - *Application restrictions*: **None**. It's a server key, and Vercel's server addresses change.
   - *API restrictions*: **Restrict key** to Places API (New) and Routes API
4. For local use, copy `.env.example` to `.env.local` and set `GOOGLE_MAPS_SERVER_KEY=…`.
5. On Vercel: **Settings → Environment Variables**, add `GOOGLE_MAPS_SERVER_KEY` as a **Sensitive** variable for Production and Preview, then redeploy.

Never give this key a `VITE_` prefix. That would put it in the public web page.

Recommended: set daily quotas on both APIs and a small billing budget (for example $1 with alerts).

## How the time is worked out

```
arrive by       = event time − arrive-early buffer
leave by        = arrive by − travel time − parking (driving)
start getting ready = leave by − getting-ready time
```

- **Driving**: Google only predicts traffic for a *departure* time, so the app estimates the departure, asks Google for the traffic-aware duration at that time, and refines it until the result settles.
- **Transit**: the app asks Google for a trip that arrives by your time. "Leave by" is the time you must walk out the door to catch the first bus or train.
- **Walking or biking**: the time is the same at any hour.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm test` | Run the unit tests for the scheduling logic |
| `npm run build` | Build a production version into `dist/` |
