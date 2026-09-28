# Awork Timer – Stream Deck plugin

Stream Deck plugin by ellegaard ID with two key actions: **Active Timer** (shows the owner's
active Awork timer, colored by state, with pause/resume/stop/restart) and **Task Timer** (a
button bindable to one specific task via long-press, to start it on demand).

- Plugin UUID: `dk.ellegaardid.awork-timer` (fixed – never change; it is permanent once published to Marketplace)
- Scaffolded with `streamdeck create` (Stream Deck CLI 1.10.1, SDK `@elgato/streamdeck` ^3.0.0, `SDKVersion: 3`)
- Dev machine: Windows 11, Node.js 24.21.0 (via nvm-windows), Stream Deck app 7.6
- Devices seen in logs: Stream Deck XL (8x4), two Stream Deck (5x3), three virtual decks
- Not yet published anywhere; git repo at https://github.com/ellegaarddk/awork-timer (private)

## Owner requirements (non-negotiable)

1. **Extensible.** Structure the code so new features and new key actions can be added without touching existing modules. Keep API access, state logic, rendering and actions separate.
2. **Settings over hardcoding.** Anything a user might want to change comes from settings (property inspector / global settings). Only sensible defaults live in code, collected in one defaults module.
3. **English only** for code, comments, identifiers, log messages and user-facing strings. Localization comes later, so keep all user-facing strings in one place, ready for Stream Deck's i18n mechanism (read the SDK's Localization guide before adding strings).
4. **Correctness over speed.** Respect API rate limits, cache where sensible, handle errors explicitly.
5. **Cross-platform.** The manifest targets Windows and macOS – do not use Windows-only APIs or paths.
6. **One step at a time.** Ask the owner when something is unclear instead of assuming. Do not claim something works without evidence (build output, logs, or observed key behavior).

## Feature scope

### Phase 1 – done
- Active Timer key shows elapsed time of the currently active Awork timer.
- Key background color reflects state: running / paused / stopped / idle / error (all configurable, per action).
- Task/project name shown as a wrapping label; a faint eID logo watermark sits behind the text.

### Phase 2 – done
- Short press: pause / resume — resolves to **restart** (same task/project/type of work) when the timer is currently `stopped`, since the key is showing that timer's info.
- Long press: stop. Both press actions configurable (`pause-resume` / `stop` / `none`), with a configurable threshold.

### Phase 3 – done: Task Timer action
- Separate key action (`dk.ellegaardid.awork-timer.task-timer`). No task picker/dropdown by design.
- **Long press**: while a timer is `running`/`paused` elsewhere, binds this key to that exact task (captures `taskId`, `projectId`, `typeOfWorkId`, `timezone`, and display names into the key's own settings). Alerts if nothing is active to capture. Resets any Custom Title on every rebind.
- **Short press**: starts tracking the bound task (`POST /me/timetracking/start`). Alerts if unbound.
- Key shows the bound project as a label, and Custom Title (if set) or the task name as the main text; colors "active" when the bound task is the one actually running/paused, else "inactive".

### Configurable settings (current)
| Setting | Scope | Notes |
|---|---|---|
| Awork Client ID | global | The OAuth API Client ID from awork's Settings → Integrations → API Clients. Not secret, but not hardcoded — checked before login/refresh, with a clear error if missing. |
| Awork connection | global | OAuth 2.0 (PKCE); "Connect to Awork" button in Active Timer's PI. No API key/user ID setting exists anymore. |
| Poll interval (s) | global | Default 20 s |
| Color: running / paused / stopped / idle / error | per Active Timer key | Hex |
| Time display format | per Active Timer key | `h:mm` or `h:mm:ss` |
| Short-press action / long-press action | per Active Timer key | `pause-resume`, `stop`, `none` |
| Long-press threshold (ms) | per key (both actions) | Default 600 |
| Custom Title | per Task Timer key | Overrides the bound task's name; reset on every rebind |
| Color: active / inactive | per Task Timer key | Hex |

## Awork API – verified facts

Verified 2026-09-28, first against an old PowerShell script + the OpenAPI spec (via the Awork
MCP connector's `find_capability`), then corrected significantly once OAuth was implemented
and live-tested. **The auth-identity section below reverses what earlier verification assumed
— trust this version.**

### Auth: OAuth 2.0 with PKCE (not an API key)
A plain workspace **API key authenticates as a separate, dedicated "API Client" identity**
(shows up in awork as a user named "stream-deck plugin (API Client)"), never as the owner.
This makes control calls unusable for this plugin's purpose:
- `POST /users/{userId}/timetracking/pause` returned `400 invalid-operation: "You can only
  pause your own time trackings"` when called with the owner's real `userId` — the API key's
  own identity doesn't match, and there is no elevated/admin override available to a plugin.
- `resume` is **documented by Awork as `/me`-only** — `/users/{userId}/timetracking/resume`
  doesn't exist as a working route at all, regardless of permissions.
- Reads (`GET /users/{userId}/timeentries/last`) happened to keep working under the API key
  regardless of whether `{userId}` was even valid (a nonexistent id returned `204`, not an
  error) — which is why display kept working long after control silently couldn't.

**Fix: the plugin authenticates as the owner via OAuth (PKCE), so `/me/...` genuinely means
them.** No `userId` setting exists or is needed.
- OAuth client "Awork Timer (Stream Deck)" registered by the owner in awork under
  **Settings → Integrations → API Clients** (self-service; the earlier assumption that this
  needed a separate partner/approval process was wrong). Public client, no secret.
  - The **Client ID is a global setting** (`oauthClientId` in `GlobalSettings`), entered in
    Active Timer's PI, not hardcoded — it isn't secret, but each installation may register its
    own client application, so it doesn't belong in source. `AworkClient.fromGlobalSettings()`
    and the "Connect to Awork" handler both check it's set *before* refreshing/starting the
    login flow, throwing `AworkMissingClientIdError` (`awork/client.ts`) with a clear message
    (`STRINGS.propertyInspector.missingClientIdError`) instead of letting awork fail generically.
  - Redirect URI `http://127.0.0.1:52305/callback`, fixed port (`AWORK_OAUTH_REDIRECT_PORT` in
    `config/defaults.ts`), must match exactly what's registered in awork.
- Authorize: `GET https://api.awork.com/api/v1/accounts/authorize` — `client_id`,
  `redirect_uri`, `scope=full_access offline_access`, `response_type=code`,
  `grant_type=authorization_code` (yes, on the *authorize* call too, per Awork's own docs),
  `state`, `code_challenge` (`base64url(sha256(code_verifier))`), `code_challenge_method=S256`.
- Token: `POST https://api.awork.com/api/v1/accounts/token` (form-encoded). Code exchange:
  `code`, `redirect_uri`, `grant_type=authorization_code`, `code_verifier`, `client_id`.
  Refresh: `client_id`, `grant_type=refresh_token`, `refresh_token`.
- Token response: `{ access_token, token_type: "Bearer", expires_in: 86400, refresh_token }`.
  Refresh tokens **rotate on every use** (save the new one each time) and expire after 30
  days unused.
- Login flow: opens the system browser (`open` package) to the authorize URL, catches the
  redirect on a one-shot local `node:http` server, exchanges the code, saves tokens to global
  settings. Triggered by a "Connect to Awork" button in the PI via
  `streamDeck.ui.onSendToPlugin`/`sendToPropertyInspector` (see `src/plugin.ts`,
  `src/awork/oauth.ts`).

### Time entry shape / state derivation
- There is **no explicit state field**. State is derived (`timer/state.ts`, verified live):

| State | Rule |
|---|---|
| Running | `endDateUtc == null` AND no break without `endDate` |
| Paused | `endDateUtc == null` AND last entry in `breaks` has no `endDate` |
| Stopped | `endDateUtc != null` (with a real `endTimeUtc`, not just a date placeholder) |
| Idle | no time entry at all (`GET .../timeentries/last` → 204/empty) |

- `duration` is `0` while the timer is active – elapsed time must be computed locally.
- Start/end time are each split: `...DateUtc` (date only, time part `00:00:00Z`) +
  `...TimeUtc` (e.g. `07:09:28.3515950`, 7 fractional digits — truncate before `Date.parse`).
- Break object when open: `{ "startDate": "2026-09-28T07:13:35Z" }` (full ISO datetime, unlike
  the split start/end fields above). Closed: adds `duration` (seconds) and `endDate`.
- `typeOfWorkId`, `projectId`, `taskId`, `timezone` are top-level fields on the entry, required
  to re-`start` tracking against the same work (used by Active Timer's "restart" and by Task
  Timer's bind/start).
- Useful display fields: `task.name`, `project.name`, `typeOfWork.name`.

**Elapsed time:**
- Running: `now − start − sum(closed break durations)`
- Paused: `openBreak.startDate − start − sum(closed break durations)`

**Control calls** (`/me/timetracking/{pause,resume,stop,start}`, verified live):
- `pause`/`resume`/`stop` take **no request body at all** (not even an optional one) — sending
  one (as the old PowerShell script did with `{}`) was the likely cause of that script's
  "pause/resume don't work" symptom.
- `start` requires a body: `{ timezone, typeOfWorkId, projectId?, taskId? }`.
- All four return the **full updated time entry** — used directly to update the shared
  poller's cache (`TimerPoller.applyEntry`) instead of re-polling.

**Not yet fully confirmed:** rate limits.

## Stream Deck quirks learned the hard way

- **`setImage` needs a `data:` URI, not a bare `<svg>` string** — `data:image/svg+xml,<percent-encoded markup>`, per the SDK's "From SVG" example. A bare SVG string is silently accepted by the JS layer but never renders.
- **Nested `<svg>` elements (with their own `viewBox`) are unreliable in the key-image pipeline** — it's a more limited renderer than a browser. Position/scale sub-content with a plain `transform="translate(...) scale(...)"` on a `<g>` instead.
- **A key's native "Title" (set by the user directly in the Stream Deck app) always wins and can't be cleared by the plugin once set** — `KeyAction.setTitle()`'s doc note: "the title can only be set by the plugin when the user has not specified a custom title." The plugin only learns the *current* title via `onTitleParametersDidChange`, never on `willAppear` — a title set before the plugin last started won't be known until the user re-saves that field once. See `native-title-tracker.ts`; when a native title is present, both actions render background-only (`buildBackgroundSvg`) rather than draw overlapping text.
- **`streamdeck validate` must be run from inside the `.sdPlugin` folder**, not the project root, or it errors about the manifest/name format.
- **Any unhandled rejection in a key-press handler can silently crash the whole plugin process** — always `.catch()` (or try/catch) the async work kicked off from `onKeyDown`/`onKeyUp`, not just `#renderKey`.

## Architecture (current)

```
src/
  plugin.ts                     # entry: logger level, register actions, connect, OAuth login handler
  config/defaults.ts            # all default values + OAuth client constants, one place
  i18n/strings.ts                # all user-facing strings (English), ready for localization
  awork/client.ts                # HTTP only: OAuth bearer auth, /me/... requests, errors — no business logic
  awork/oauth.ts                 # PKCE login flow (local callback server, browser launch) + token refresh
  awork/pkce.ts                  # pure PKCE verifier/challenge functions (kept dependency-free so it's directly unit-testable)
  awork/types.ts                 # typed subset of the time entry response
  timer/state.ts                 # pure functions: derive state, elapsed seconds, press-decision helpers, task-match helper
  timer/poller.ts                # shared polling loop + cache, one per plugin (not per key); applyEntry() for instant updates after control calls
  render/key-renderer.ts         # builds the SVG (data URI) for a key: background/logo, wrapping label, wrapping/centered main text, background-only variant
  actions/press-tracker.ts       # shared short-press/long-press timing, keyed by action instance id
  actions/native-title-tracker.ts # tracks each key's native Stream Deck title (see quirks above)
  actions/active-timer.ts        # Active Timer action
  actions/task-timer.ts          # Task Timer action
```

- `timer/state.ts` is pure and unit-tested (`timer/state.test.ts`, `awork/pkce.test.ts`) — no I/O, `now` passed in where relevant.
- One shared poller (`timer/poller.ts`) for all visible keys of both actions; a local 1 s tick updates the display between polls; stops when no key is visible.
- Tests run directly via Node's native TS execution (`npm run test` → `node --test src/timer/*.test.ts src/awork/*.test.ts`, no build step, no extra deps). **Gotcha:** a test can only import modules whose *relative* imports are type-only, or that have zero further relative imports — production code uses `.js`-suffixed specifiers (for the Bundler/Rollup build) which Node's native TS runner cannot resolve to the sibling `.ts` file. This is why `pkce.ts` was split out of `oauth.ts`: it has no project imports, so it's directly testable; `oauth.ts` itself isn't.

## Scaffold notes

- The original scaffold action `increment-counter` has been fully removed (replaced by Active Timer, then Task Timer added alongside it).
- `streamDeck.logger.setLevel("info")` in `plugin.ts` — never `"trace"`, to avoid logging OAuth tokens.
- `.gitignore` excludes `node_modules/`, `*.sdPlugin/bin`, `*.sdPlugin/logs`, and `/logs` (a stray top-level logs dir that `streamdeck` CLI commands create if run from the wrong cwd — see the validate quirk above).
- Logs: `dk.ellegaardid.awork-timer.sdPlugin/logs/` (rotates; check the newest-modified file, not always `.0.log`).
- Action icons are still placeholder art (copied from the scaffold's counter icons) — real branding is a separate follow-up task.
- eID logo watermark asset: `dk.ellegaardid.awork-timer.sdPlugin/imgs/branding/eid-logo.svg` — a copy of the brand favicon with its hardcoded fill removed so `key-renderer.ts` can tint it white.

## Commands

```powershell
npm run build     # rollup -c
npm run watch     # rebuild + streamdeck restart dk.ellegaardid.awork-timer
npm run test       # node --test src/timer/*.test.ts src/awork/*.test.ts
streamdeck restart dk.ellegaardid.awork-timer
cd dk.ellegaardid.awork-timer.sdPlugin; streamdeck validate   # must run from inside the .sdPlugin folder
streamdeck -v     # CLI version (not --version)
```

## References
- Stream Deck SDK: https://docs.elgato.com/streamdeck/sdk/introduction/getting-started
- Keys guide: https://docs.elgato.com/streamdeck/sdk/guides/keys
- Settings guide: https://docs.elgato.com/streamdeck/sdk/guides/settings
- Property inspectors: https://docs.elgato.com/streamdeck/sdk/guides/ui
- Localization: https://docs.elgato.com/streamdeck/sdk/guides/i18n
- sdpi-components (property inspector library): https://sdpi-components.dev/docs
- Awork API docs: https://developers.awork.com (also reachable via the Awork MCP connector's `find_capability`/`find_guidance` for exact route contracts)
