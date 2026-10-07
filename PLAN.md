# Leave By: plan and build log

## What it is

**Leave By is a web app for anyone who knows when they need to be somewhere but struggles to work backward; it uses real Google Maps travel times to tell you exactly when to start getting ready and when to leave.**

- Live: https://leave-by-rho.vercel.app
- Code: this repository. Every push to `main` deploys to Vercel automatically.

## "Do this, see that" test

> **Do this:** Set an event at **9:00 PM** at **Golden Gate Park, San Francisco**, leaving from the **Ferry Building, San Francisco**, by **Drive**, with **30 min** to get ready and **arrive early by 10 min** (parking 5 min).
>
> **See that:** The status line shows the drive time (about 4.6 mi, "with predicted traffic"). The result card shows a large **"Leave by"** time of about **8:03 PM**, **"Start getting ready"** about **7:33 PM**, and a timeline: get ready → leave → park → arrive (8:50 PM) → event (9:00 PM). Exact times shift with predicted traffic.

## The plan (made in Plan mode, approved before building)

**Problem:** I often know what time I need to be somewhere, but I struggle to work backward and account for travel time, getting-ready time and buffers. The app should do the calculation and make the answer immediately clear.

**Decisions made while planning:**
- Travel times come from **Google Maps**, chosen over free OpenStreetMap (no transit, no live traffic) and manual entry.
- A **React + Vite web app laid out for phones**, chosen over a single HTML file.

**Core calculation:**
```
arrive by           = event time − arrive-early buffer
leave by            = arrive by − travel time − parking (driving)
start getting ready = leave by − getting-ready time
```
- **Transit:** ask Google for a trip that *arrives by* the target time; "leave by" is when to walk out the door to catch the first vehicle.
- **Driving:** Google only predicts traffic for a *departure* time, so estimate the departure, ask again with that time, and refine until it settles.
- **Walking or biking:** one lookup, because the time doesn't depend on the hour.

**One screen:**
1. What and when: event name, date, start time
2. Where: destination and starting point (address suggestions, or "use my location")
3. How: Drive / Transit / Walk / Bike
4. Timing: getting-ready time, arrive-early buffer, parking (driving)
5. Result: a large "Leave by" time with a live countdown that changes colour as time runs out, a timeline, a step-by-step "how this was worked out", an "Open in Google Maps" link, and "Add reminders to calendar"

**Extras:** saved defaults (starting point and timing), a manual travel-time fallback, and a calendar file with "get ready" and "leave" alarms.

**Planned verification:** unit tests for the calculation, real trips compared with Google Maps, a phone-width check in light and dark mode, the manual fallback with no key, and calendar import.

## Changes made during the build

| What changed | Why |
| --- | --- |
| **Google calls moved to the server.** The browser calls `/api/autocomplete` and `/api/route` (Vercel functions), which call Google with a server-only key. The Maps JavaScript API was removed. | Security review: the original plan put the key in the web page (`VITE_` prefix). Anyone could copy it and fake the site's address to use it. The key is now never sent to browsers. |
| **Route to the place you picked, not its centre point.** | Testing found Golden Gate Park being routed to the middle of the park: 8.4 mi instead of 4.6. |
| **Custom address suggestions instead of Google's widget.** | Gave full control over styling; it was also needed once the calls moved to the server. |
| **Fewer component files** than listed in the plan. | The event form, timeline and countdown were small enough to live in `App.tsx` and `ResultCard.tsx`. |
| **Deployed to Vercel and connected to GitHub.** | Course requirement: the app is live, and pushes deploy automatically. |
| **No Supabase.** | The app doesn't save data to a server. Settings stay in the user's own browser (localStorage). |

## Security review

Run on 2026-10-06. The `/security-review` command needs the session to be open in this repository folder, so the same checks were run by hand. Findings and fixes:

| Finding | Status |
| --- | --- |
| Google Maps key visible in the live page and usable by anyone faking the site's referer (confirmed with a test request) | **Fixed:** the key now lives only in Vercel's environment variables as a Secret (`GOOGLE_MAPS_SERVER_KEY`) and in a local `.env.local` that is never committed. The old key was deleted in Google Cloud and is confirmed rejected. |
| Server endpoints could be abused | **Mitigated:** they reject other websites, non-JSON requests and invalid input, limit requests per visitor, and never pass Google's error details on. A $1 monthly Google Cloud budget alert is the backstop. |
| Secrets in the GitHub history | **None found.** `.env.local` and `.vercel` have never been committed. |
| Unsafe code (raw HTML insertion, eval) | **None found.** |
| Dependency vulnerabilities (`npm audit`) | **0.** |
| HTTPS | Enforced by Vercel (HSTS). |

## Verification status

- ✅ 23 unit tests (`npm test`): the calculation, the server's input checks, rate limiting, the driving traffic refinement and the transit departure time
- ✅ Real trips in all four modes, locally and on the live site; driving matched Google's traffic-aware time for the same departure
- ✅ Phone width (375 px) in dark mode, with no horizontal scrolling
- ✅ Manual travel-time fallback
- ⬜ Calendar file imported into a calendar app (not yet tested)
