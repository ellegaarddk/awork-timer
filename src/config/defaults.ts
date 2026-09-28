import type { TimerState } from "../timer/types.js";

/** All default values live here; nothing else in the codebase should hardcode these. */

export const AWORK_BASE_URL = "https://api.awork.com/api/v1";

/**
 * OAuth 2.0 (PKCE) constants for the "Awork Timer (Stream Deck)" client application, created by
 * the owner under Settings → Integrations → API Clients in awork. The client ID is a public
 * identifier (not secret) — safe to commit, same as any native/CLI OAuth app.
 */
export const AWORK_OAUTH_CLIENT_ID = "stream-deck-4628";
export const AWORK_OAUTH_REDIRECT_PORT = 52305;
export const AWORK_OAUTH_REDIRECT_URI = `http://127.0.0.1:${AWORK_OAUTH_REDIRECT_PORT}/callback`;
export const AWORK_OAUTH_SCOPE = "full_access offline_access";
export const AWORK_OAUTH_AUTHORIZE_URL = "https://api.awork.com/api/v1/accounts/authorize";
export const AWORK_OAUTH_TOKEN_URL = "https://api.awork.com/api/v1/accounts/token";
/** Refresh this many ms before the access token's real expiry, to avoid using a stale one. */
export const AWORK_OAUTH_REFRESH_SKEW_MS = 5 * 60 * 1000;

export const DEFAULT_POLL_INTERVAL_SECONDS = 20;

export const DEFAULT_TIME_FORMAT: TimeFormat = "h:mm:ss";

export type TimeFormat = "h:mm" | "h:mm:ss";

export const DEFAULT_COLORS: Record<TimerState, string> = {
	running: "#14532d",
	paused: "#78350f",
	stopped: "#1f2937",
	idle: "#0f172a",
	error: "#7f1d1d"
};

export type PressAction = "pause-resume" | "stop" | "none";

export const DEFAULT_SHORT_PRESS_ACTION: PressAction = "pause-resume";
export const DEFAULT_LONG_PRESS_ACTION: PressAction = "stop";
export const DEFAULT_LONG_PRESS_THRESHOLD_MS = 600;

/** Reuses the running/idle shades so a bound Task Timer key looks consistent with Active Timer. */
export const DEFAULT_TASK_TIMER_COLORS = {
	active: DEFAULT_COLORS.running,
	inactive: DEFAULT_COLORS.idle
};
