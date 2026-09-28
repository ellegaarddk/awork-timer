import type { TimerState } from "../timer/types.js";

/** All default values live here; nothing else in the codebase should hardcode these. */

export const AWORK_BASE_URL = "https://api.awork.com/api/v1";

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
