# Awork Timer – Stream Deck plugin

Stream Deck plugin by ellegaard ID that shows the active Awork timer on a key, colors the key by timer state, and lets the user pause/resume/stop the timer from the key.

- Plugin UUID: `dk.ellegaardid.awork-timer` (fixed – never change; it is permanent once published to Marketplace)
- Scaffolded with `streamdeck create` (Stream Deck CLI 1.10.1, SDK `@elgato/streamdeck` ^3.0.0, `SDKVersion: 3`)
- Dev machine: Windows 11, Node.js 24.21.0 (via nvm-windows), Stream Deck app 7.6
- Devices seen in logs: Stream Deck XL (8x4), two Stream Deck (5x3), three virtual decks

## Owner requirements (non-negotiable)

1. **Extensible.** Structure the code so new features and new key actions can be added without touching existing modules. Keep API access, state logic, rendering and actions separate.
2. **Settings over hardcoding.** Anything a user might want to change comes from settings (property inspector / global settings). Only sensible defaults live in code, collected in one defaults module.
3. **English only** for code, comments, identifiers, log messages and user-facing strings. Localization comes later, so keep all user-facing strings in one place, ready for Stream Deck's i18n mechanism (read the SDK's Localization guide before adding strings).
4. **Correctness over speed.** Respect API rate limits, cache where sensible, handle errors explicitly.
5. **Cross-platform.** The manifest targets Windows and macOS – do not use Windows-only APIs or paths.
6. **One step at a time.** Ask the owner when something is unclear instead of assuming. Do not claim something works without evidence (build output, logs, or observed key behavior).

## Feature scope

### Phase 1 – primary
- Key shows elapsed time of the currently active Awork timer.
- Key background color reflects state: running / paused / stopped (colors configurable).

### Phase 2 – secondary
- Short press: pause or resume (configurable).
- Long press: stop (configurable; threshold in ms configurable).

### Configurable settings (planned)
| Setting | Scope | Notes |
|---|---|---|
| Awork API key | global | Secret. Never log it, never commit it. |
| Awork user ID | global | Owner's user ID; required because the API key acts as a separate API user |
| Poll interval (s) | global | Default suggestion: 15–30 s |
| Color: running / paused / stopped | per action | Hex |
| Long-press threshold (ms) | per action | |
| Short-press action / long-press action | per action | pause-resume, stop, none |
| Time display format | per action | e.g. `h:mm`, `h:mm:ss` |

## Awork API – verified facts

Verified on 2026-09-28 against the owner's live workspace via Awork's OpenAPI spec and real calls, and against the owner's earlier working PowerShell script (`C:\Users\MortenEllegaardLarse\Nextcloud\Documents\Streamdeck\Scripts\awork-timer.ps1`, log shows successful calls July–September 2026).

### Connection (from the working script)
- Base URL: `https://api.awork.com/api/v1`
- Auth: `Authorization: Bearer <API key>` (confirmed working in the script's log)
- Alternative auth in the script: client_credentials via `POST /accounts/token` (form-encoded). Not needed unless API keys stop working.

### IMPORTANT: API key identity
An Awork API key authenticates as a **separate API user, not as the owner**. Therefore:
- Do **not** use `/me/...` routes from the plugin – they would return the API user's data.
- Use the owner's user ID explicitly:
  - Read state: `GET /users/{userId}/timeentries/last`
  - Control: `POST /users/{userId}/timetracking/pause | resume | stop` (all exist in the spec)
- `userId` must be a **setting** (global), not hardcoded. The owner's ID is recorded in the old script; ask the owner before putting it anywhere in the repo.
- The `/me/...` observations below were made through an OAuth connection that acts as the owner; the response shape is the same for `/users/{userId}/timeentries/last` (same schema in the spec).

### Control calls
- The old script sent `POST .../timetracking/{stop|pause|resume}` with an empty JSON body `{}`. Stop worked; pause/resume were reported as not working and never debugged. Check the spec's request body for pause/resume before implementing, and verify against the live API.
- Earlier reference calls: `GET /me/timeentries/last`, `POST /me/timetracking/*` (owner context only).
- There is **no explicit state field**. State is derived:

| State | Rule | Status |
|---|---|---|
| Running | `endDateUtc == null` AND no break without `endDate` | Verified |
| Paused | `endDateUtc == null` AND last entry in `breaks` has no `endDate` | Verified |
| Stopped | `endDateUtc != null` | Not yet verified – test when the owner stops a timer |

- `duration` is `0` while the timer is active – elapsed time must be computed locally.
- Start time is split: `startDateUtc` (date, time part `00:00:00Z`) + `startTimeUtc` (e.g. `07:09:28.3515950`, 7 fractional digits). Combine them carefully; do not rely on `Date.parse` accepting 7 fractional digits.
- Break object when open: `{ "startDate": "2026-09-28T07:13:35Z" }`
- Break object when closed: `{ "startDate": "...", "duration": 27, "endDate": "2026-09-28T07:14:03Z" }` (duration in seconds)
- Entry-level `breakDuration` was `null` with only an open break and `27` after one closed break. Assumed to be the sum of closed breaks – not verified with multiple breaks; prefer summing `breaks[].duration` yourself.
- Useful display fields: `task.name`, `project.name`, `typeOfWork.name`.

**Elapsed time:**
- Running: `now − start − sum(closed break durations)`
- Paused: `openBreak.startDate − start − sum(closed break durations)`

**Not yet confirmed (verify before use):**
- Rate limits.
- Request bodies for pause/resume (see above).
- Behaviour when the user has never tracked time (empty response / 404).

## Architecture (proposed)

```
src/
  plugin.ts                 # entry: logger level, register actions, connect
  config/defaults.ts        # all default values, one place
  i18n/strings.ts           # all user-facing strings (English), ready for localization
  awork/client.ts           # HTTP only: auth, requests, errors, no business logic
  awork/types.ts            # typed subset of the time entry response
  timer/state.ts            # pure functions: derive state + elapsed seconds from a time entry
  timer/poller.ts           # shared polling loop + cache, one per plugin (not per key)
  render/key-renderer.ts    # builds title/SVG image for a key from state + settings
  actions/active-timer.ts   # the key action: subscribes to poller, handles key down/up
```

- `timer/state.ts` must be pure and unit-testable (no I/O, `now` passed in).
- One shared poller for all visible keys; a local 1 s tick updates the display between polls.
- Stop the poller when no key is visible.

## Scaffold notes

- `src/plugin.ts` currently sets `streamDeck.logger.setLevel("trace")`. Trace logs every message between Stream Deck and the plugin, including settings. **Lower this before the API key is introduced** (e.g. `info`), or make it configurable.
- The example action `increment-counter` (TS, HTML, manifest entry, `imgs/actions/counter`) is scaffold only – replace it with the real action.
- `.gitignore` already excludes `node_modules/`, `*.sdPlugin/bin`, `*.sdPlugin/logs`.
- Logs: `dk.ellegaardid.awork-timer.sdPlugin/logs/`.

## Commands

```powershell
npm run build     # rollup -c
npm run watch     # rebuild + streamdeck restart dk.ellegaardid.awork-timer
streamdeck restart dk.ellegaardid.awork-timer
streamdeck validate
streamdeck -v     # CLI version (not --version)
```

## References
- Stream Deck SDK: https://docs.elgato.com/streamdeck/sdk/introduction/getting-started
- Keys guide: https://docs.elgato.com/streamdeck/sdk/guides/keys
- Settings guide: https://docs.elgato.com/streamdeck/sdk/guides/settings
- Property inspectors: https://docs.elgato.com/streamdeck/sdk/guides/ui
- Localization: https://docs.elgato.com/streamdeck/sdk/guides/i18n
