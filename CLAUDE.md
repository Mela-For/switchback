# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Outdoor Trip Planner — an Expo / React Native (TypeScript) mobile app for planning backpacking/hiking/biking trips: trip list, packing lists, notes, itinerary/calendar, meals, group chat, and a places/trails browser, collaborative from the start via invite codes. The differentiating bet is collaborative trip-planning depth (not a generic checklist app) plus AI used narrowly for outdoor-specific data integrations (recreation.gov today; trail-data quality on par with AllTrails) — see [ARCHITECTURE.md](ARCHITECTURE.md) for the design rationale.

Personal/solo project, built with Claude Code; this file is the guidance it works from. CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs `npm ci` + `npm run typecheck` + `npm run lint` + `npm test` for the app, then installs, typechecks, and tests `functions/` separately, on push/PR to `main`. Do all work on a feature branch (never commit directly to `main`).

Although this is a personal project, treat it as pre-production software meant for eventual real-world use and sharing with others — apply full software engineering best practices (security, correctness, proper error handling at boundaries, no cut corners) at all times rather than "good enough for just me."

## Commands

```bash
npm start        # expo start — Metro bundler, scan QR with Expo Go
npm run ios       # expo start --ios
npm run android   # expo start --android
npm run web       # expo start --web
```

```bash
npm run lint   # expo lint — eslint-config-expo flat config (eslint.config.js), covers react-hooks/exhaustive-deps, unused vars, etc.
```

There is no Prettier/formatter configured — don't add one unprompted (formatting-only, lower value for a solo project; ESLint above is the one that was explicitly requested).

```bash
npm run typecheck   # tsc --noEmit
```

```bash
npm test   # jest — unit tests for pure functions (invite codes, trail distance/elevation, trip-history stats, overnight stays, date utils, URL safety, Firestore update sanitizing)
```

Jest is configured via the `jest` key in `package.json` (`jest-expo` preset; `transformIgnorePatterns` and `testEnvironmentOptions.customExportConditions` are both extended beyond the preset defaults so the Firebase modular SDK's package.json `exports` resolves to its CJS build under Jest instead of an untransformed ESM/`.mjs` entry — without that, importing anything from `firebase/*` in a test throws a syntax error). `@testing-library/react-native` is installed but not yet used — no component tests exist yet (Firestore-backed hooks need the Firebase Local Emulator Suite first; RNTL component tests are intentionally deferred until there's a specific regression to cover).

## Architecture

**Navigation** ([App.tsx](App.tsx)): a top-level switch on Firebase auth state (`RootNavigator`) renders either the unauthenticated `AuthStack` (SignIn/SignUp) or `MainTabs`. `MainTabs` is a bottom tab navigator with three tabs: `PlacesTab` (the landing screen — a standalone places browser, not trip-scoped), `TrailsTab` (standalone trail search), and `TripsTab` (a native-stack of all trip screens — list, detail, packing list, map, itinerary, assignments, where-we're-sleeping, history, chat; gated behind sign-in). Route param types live in [src/types/navigation.ts](src/types/navigation.ts) — add new screens to the relevant `*ParamList` there first.

**Data layer — Firestore is authoritative.** [src/hooks/useFirestoreTrips.ts](src/hooks/useFirestoreTrips.ts) is the real data hook, wired in via [src/context/TripsContext.tsx](src/context/TripsContext.tsx) and consumed through `useTripsContext()`. It subscribes to `trips` where `collaboratorUids array-contains <uid>`, and handles add/update/delete/join-by-invite-code. (A legacy AsyncStorage-only `useTrips`/`storage.ts` implementation of the same interface was removed — it was unused and unwired, and had drifted out of sync with the `Trip` type.)

Trips are collaborative Firestore documents (`trips/{id}`, sub-collection `trips/{id}/messages` for chat) keyed by `ownerUid`/`collaboratorUids`/`collaborators` (uid → display name) and joined via an 8-char (6-char on older trips) `inviteCode` ([src/utils/inviteCode.ts](src/utils/inviteCode.ts)). All Trip fields are in [src/types/index.ts](src/types/index.ts) — this is the single source of truth for the data model (packing list, places, trails, itinerary events, meals, chat messages, trip-history snapshots). `updateTrip` sanitizes `undefined` values into Firestore `deleteField()` since Firestore rejects raw `undefined`, via the pure/tested [src/utils/firestoreUpdates.ts](src/utils/firestoreUpdates.ts) helper.

**Auth**: [src/context/AuthContext.tsx](src/context/AuthContext.tsx) wraps Firebase email/password auth (`onAuthStateChanged` drives `RootNavigator`'s branch above).

**External data sources**:
- Google Places API — search/autocomplete/details/photos/static maps, in [src/utils/placesApi.ts](src/utils/placesApi.ts), keyed by [src/config/googlePlaces.ts](src/config/googlePlaces.ts).
- Overpass API (OpenStreetMap) + Nominatim geocoding for trail search/geometry, in [src/utils/overpassApi.ts](src/utils/overpassApi.ts) — trail distance is computed client-side via haversine over the returned polyline.
- USGS 3DEP's Elevation Point Query Service for trail elevation gain/loss, in [src/utils/elevationApi.ts](src/utils/elevationApi.ts) — see that file's doc comments for the sampling/concurrency/noise-threshold approach.
- `react-native-maps` for on-device interactive maps (trip map, itinerary daily movement view); Google Static Maps API for lightweight map thumbnails.

**Backend — Cloud Functions** ([functions/](functions/), Firebase Functions v2, its own TypeScript project/`package.json`/tests, not part of the Expo app's build). Currently one `onCall` function, `recreationGovLookup` ([functions/src/index.ts](functions/src/index.ts)): resolves a pasted recreation.gov campground URL via the official RIDB API, summarizing the description with Anthropic's Claude only when it's long enough to be worth summarizing (AI used narrowly — RIDB already returns structured data, nothing is extracted/guessed by the model). Client-side wrapper is [src/utils/aiApi.ts](src/utils/aiApi.ts), called from the "Paste a recreation.gov link" section on the Browse Places tab. Both provider keys (`ANTHROPIC_API_KEY`, `RIDB_API_KEY`) are Firebase Functions v2 secrets (`defineSecret`, set via `firebase functions:secrets:set`) — never `.env`, since neither key supports the referrer/bundle-ID restrictions the Google Places key does, so an embedded client key would be fully unrestricted the moment the app is decompiled. `onCall` functions do **not** automatically reject unauthenticated callers — each handler explicitly checks `request.auth`. Requires the Firebase project's Blaze (pay-as-you-go) plan; the free Spark plan blocks all outbound network calls from functions, which both RIDB and Anthropic need. One-time setup (billing, API keys, secrets) happens in the Firebase console/CLI, not the repo. Deploy via `npm run deploy:functions` from the repo root.

**Firebase/Google API keys live in `.env` (gitignored), never in source.** [src/firebase/config.ts](src/firebase/config.ts) and [src/config/googlePlaces.ts](src/config/googlePlaces.ts) read `process.env.EXPO_PUBLIC_*` (Expo's built-in env var support — no extra package/babel config needed), and the Google Maps key in [app.config.js](app.config.js) (dynamic config, not static `app.json`, specifically so it can read `process.env`) does the same. `.env.example` is checked in with blank placeholders documenting exactly which vars are needed and where to get them; real values only ever exist in the local, gitignored `.env`. Do not reintroduce hardcoded literal keys in these files. A committed `.githooks/pre-commit` hook (wired up via `git config core.hooksPath .githooks`) greps staged diffs for key-shaped strings as a backstop against accidentally re-committing one. The Google Places/Maps key ships in the client by necessity, so it must be restricted (bundle ID / package + SHA-1 / API scope) in Google Cloud Console.

**Trip history**: [src/screens/MyHistoryScreen.tsx](src/screens/MyHistoryScreen.tsx) is a personal cross-trip recap, computed by pure/tested aggregation in [src/utils/tripHistory.ts](src/utils/tripHistory.ts)/[tripHistoryStats.ts](src/utils/tripHistoryStats.ts). Archived trips are read live while the user is still a collaborator; leaving an archived trip snapshots a privacy-trimmed copy into `userTripHistory/{uid}/entries/{tripId}` (owner-only rules).

**Firestore security rules** live in [firestore.rules](firestore.rules) (deploy via the Firebase console's Rules tab, or `firebase deploy --only firestore:rules` if the Firebase CLI is installed). Rules now scope `trips`/`trips/{id}/messages` reads strictly to `collaboratorUids` membership — there is no broader "any signed-in user" read path. This required moving invite-code lookups out of `trips` and into a separate `inviteCodes/{code}` collection (`{ tripId, ownerUid }`, `get`-only — `list` is disabled so codes can't be enumerated): `addTrip` writes the trip and its invite-code mapping in one batch, `joinTripByCode` resolves a code via `inviteCodes` then writes itself into the trip's `collaboratorUids` (the rules allow a non-collaborator to add only their own uid and name — no other field — and only while the trip's invite code is live), and an `inviteCodes` entry can only be created for a trip the caller owns, and `deleteTrip` retires the code when the owner deletes the trip. See [src/hooks/useFirestoreTrips.ts](src/hooks/useFirestoreTrips.ts).

**Itinerary/calendar/meals features** are the most structurally complex part of the data model: `ItineraryEvent` cross-references `TripPlace.placeId`, `Trail.id`, and `PackingItem.id` by id, and `DayMeal`/`MealIngredient` carry their own `assigneeUids`. When touching itinerary or meals code, check all the places that hold a reverse-reference (e.g. "show when this place is scheduled" on the places list) rather than just the itinerary screen itself.

**Untrusted URLs**: links stored on a trip (recipe, recreation.gov reservation) are editable by any collaborator, so they're opened only through [src/utils/safeUrl.ts](src/utils/safeUrl.ts), which refuses anything but http(s).

**Logging & crash reporting**: all `console.log`/`console.error` call sites were replaced with [src/utils/logger.ts](src/utils/logger.ts) (`logger.log`/`logger.error`) — `logger.log` is silent outside dev builds (`__DEV__`), `logger.error` always forwards to Sentry via `Sentry.captureException`/`captureMessage`. Sentry itself only activates if `EXPO_PUBLIC_SENTRY_DSN` is set in `.env` ([src/config/sentry.ts](src/config/sentry.ts) calls `Sentry.init()` only when the DSN is present); without it, all Sentry calls are documented-safe no-ops, so the app behaves identically to before Sentry was added. `App.tsx`'s default export is wrapped in `Sentry.wrap()` for a top-level error boundary. `@sentry/react-native` is also in `app.config.js`'s `plugins` array for future native/EAS builds — no source-map upload yet, since that's tied to EAS builds; today's setup only covers JS-error capture, which is all Expo Go supports anyway.
