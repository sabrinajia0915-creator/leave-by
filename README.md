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

## Turn on Google Maps travel times

1. Go to <https://console.cloud.google.com/>, create a project and set up billing. Normal personal use stays inside Google's monthly free usage.
2. Under **APIs & Services → Library**, enable:
   - **Maps JavaScript API**
   - **Places API (New)**
   - **Routes API**
3. Under **APIs & Services → Credentials**, click **Create credentials → API key**.
4. Restrict the key (recommended):
   - *Application restrictions*: **Websites**, add `http://localhost:5173/*` (and your deployed URL later)
   - *API restrictions*: the three APIs above
5. Copy `.env.example` to `.env.local` and paste the key:
   ```
   VITE_GOOGLE_MAPS_API_KEY=your-key-here
   ```
6. Restart `npm run dev`.

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
