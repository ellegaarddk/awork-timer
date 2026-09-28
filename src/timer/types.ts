import type { AworkTimeEntry } from "../awork/types.js";

export type TimerState = "running" | "paused" | "stopped" | "idle" | "error";

export type TimerSnapshot = {
	state: TimerState;
	elapsedSeconds: number;
	entry: AworkTimeEntry | null;
	error?: string;
};

/** Global (plugin-wide) settings; never hardcode these values, never log the API key. */
export type GlobalSettings = {
	apiKey?: string;
	userId?: string;
	pollIntervalSeconds?: number;
};
