# Awork Timer for Stream Deck

A Stream Deck plugin that shows and controls your [awork](https://www.awork.com) time tracking from a key.

- See the elapsed time of your active awork timer, colored by state.
- Pause, resume, stop or restart the timer without leaving what you are doing.
- Bind keys to specific tasks and start their timers with one press.

Built by [ellegaard ID](https://eid.dk).

## Actions

### Active Timer

Shows the timer that is currently tracked in awork.

- **Display:** elapsed time (`h:mm:ss` or `h:mm`), the task name (or project name) and a background color for the current state.
- **States:** running, paused, stopped, idle (no time entry yet) and error. Each state has its own configurable color.
- **Short press** (default: pause/resume): running → pause, paused → resume, stopped → restart a new entry on the same task, project and type of work.
- **Long press** (default: stop): stops a running or paused timer.

Both press actions can be set to *Pause / Resume*, *Stop* or *None*, and the long-press threshold is configurable.

### Task Timer

A key bound to one specific awork task.

- **Bind:** while a timer is running or paused, long-press the key. It binds to that task.
- **Start:** short-press to start tracking the bound task. awork stops any other running timer.
- **Display:** the task name (or a custom title) and the project name. The key uses the active color while its task is being tracked, and the inactive color otherwise.

Rebinding clears any custom title from the previous binding. A title set directly in the Stream Deck app takes precedence over the plugin's own text.

## Requirements

- Stream Deck app 7.1 or later
- Windows 10 or later, or macOS 12 or later
- An awork account

## Installation from source

Building requires Node.js 24 or later and the [Stream Deck CLI](https://docs.elgato.com/streamdeck/cli/intro).

```bash
npm install -g @elgato/cli
git clone https://github.com/ellegaarddk/awork-timer.git
cd awork-timer
npm install
npm run build
streamdeck link dk.ellegaardid.awork-timer.sdPlugin
```

Restart the Stream Deck app if the plugin does not appear.

To create an installable `.streamDeckPlugin` file:

```bash
streamdeck pack dk.ellegaardid.awork-timer.sdPlugin
```

## Connecting to awork

The plugin signs in with your own awork API client. Setup is done once and shared by all keys.

### 1. Create an API client in awork

1. In awork, go to **Settings → Integrations → API Clients** and create a new client.
2. Set the redirect URI to exactly `http://127.0.0.1:52305/callback`.
3. Copy the client ID.

### 2. Connect the plugin

1. Drag an **Active Timer** action onto a key.
2. In the key's settings, paste the client ID into **Awork Client ID**.
3. Click **Connect to Awork**.
4. Your browser opens awork's login and consent page. Approve access.
5. The settings panel shows *Connected as …* when the login succeeded.

If the client ID is empty, the plugin stops with *Missing awork client ID – enter it in the key's settings* instead of sending an incomplete request to awork.

### Why OAuth and not an API key

An awork API key authenticates as a separate API user, not as you. awork only lets you pause, resume or stop your own time tracking, so control calls made with an API key are rejected (`400 invalid-operation: "You can only pause your own time trackings."`). The plugin therefore signs in as you via OAuth 2.0 with PKCE.

- The login runs through a one-time local callback on `http://127.0.0.1:52305/callback`.
- The client ID, access token and refresh token are stored in the plugin's global settings in the Stream Deck app. Tokens are refreshed automatically before they expire.
- Tokens are never written to the plugin's logs.

## Settings

| Setting | Scope | Default |
|---|---|---|
| Awork client ID | All keys | None (required) |
| Poll interval | All keys | 20 s (10–120 s) |
| Time format | Active Timer key | `h:mm:ss` |
| Colors: running / paused / stopped / idle / error | Active Timer key | `#14532d` / `#78350f` / `#1f2937` / `#0f172a` / `#7f1d1d` |
| Short press / long press | Active Timer key | Pause / Resume, Stop |
| Long-press threshold | Per key | 600 ms (200–2000 ms) |
| Custom title | Task Timer key | Task name |
| Active / inactive color | Task Timer key | `#14532d` / `#0f172a` |

All defaults live in `src/config/defaults.ts`.

## How it works

- One shared poller calls `GET /me/timeentries/last` at the poll interval for all visible keys and stops when no key is visible. Between polls, the displayed time ticks locally every second.
- awork has no explicit timer-state field, so the state is derived from the latest time entry:

  | State | Rule |
  |---|---|
  | Running | `endDateUtc` is empty and no break is open |
  | Paused | `endDateUtc` is empty and the last break has no `endDate` |
  | Stopped | `endDateUtc` is set |
  | Idle | No time entry exists |

- Elapsed time is computed locally, because `duration` is `0` while an entry is active: now (or the start of the open break) minus the start time, minus the duration of closed breaks.
- Control calls use `POST /me/timetracking/pause`, `/resume`, `/stop` and `/start`. Their responses update the keys immediately, without waiting for the next poll.

## Development

```bash
npm run watch   # rebuild on change and restart the plugin in Stream Deck
npm run build   # one-off build
npm test        # unit tests (node --test)
```

Plugin logs are written to `dk.ellegaardid.awork-timer.sdPlugin/logs/`.

### Project structure

```
src/
  plugin.ts                    Entry point: registers actions and handles the awork login
  actions/
    active-timer.ts            Active Timer key
    task-timer.ts              Task Timer key
    press-tracker.ts           Short/long press detection shared by actions
    native-title-tracker.ts    Detects titles set in the Stream Deck app
  awork/
    client.ts                  HTTP client for the awork API
    oauth.ts, pkce.ts          OAuth 2.0 PKCE login and token refresh
    types.ts                   Typed subset of awork responses
  config/defaults.ts           All default values
  i18n/strings.ts              All user-facing strings
  render/key-renderer.ts       SVG key images
  timer/
    poller.ts                  Shared polling loop
    state.ts                   Pure state and elapsed-time logic (unit tested)
    types.ts                   Shared types and global settings
```

New key types are added as new files in `src/actions/` that reuse the poller, client and renderer.

### Conventions

- Code, comments and user-facing strings are in English. All user-facing strings live in `src/i18n/strings.ts`, ready for localization.
- Anything a user might want to change is a setting. Defaults live in `src/config/defaults.ts` only.
- Never log settings or tokens.

## Roadmap

- Localization, starting with Danish.

## License

[MIT](LICENSE) © 2026 ellegaard ID
