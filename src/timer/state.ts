import type { AworkTimeEntry } from "../awork/types.js";
import type { TimerState } from "./types.js";

/**
 * Combines Awork's split start date/time fields into a `Date`.
 *
 * `startTimeUtc` can carry up to 7 fractional-second digits (e.g. `"07:09:28.3515950"`), which
 * `Date.parse` does not reliably accept, so the fraction is truncated to milliseconds first.
 */
export function parseAworkDateTime(dateUtc: string, timeUtc: string): Date {
	const datePart = dateUtc.slice(0, 10);
	const [time, fraction = ""] = timeUtc.split(".");
	const millis = fraction.slice(0, 3).padEnd(3, "0");
	return new Date(`${datePart}T${time}.${millis}Z`);
}

/**
 * Derives the timer's state from a time entry. `null` means the user has never tracked time.
 */
export function deriveState(entry: AworkTimeEntry | null): TimerState {
	if (!entry) {
		return "idle";
	}
	if (entry.endDateUtc) {
		return "stopped";
	}
	const breaks = entry.breaks ?? [];
	const lastBreak = breaks[breaks.length - 1];
	if (lastBreak && !lastBreak.endDate) {
		return "paused";
	}
	return "running";
}

function sumClosedBreakSeconds(entry: AworkTimeEntry): number {
	return (entry.breaks ?? []).reduce((total, b) => (b.endDate ? total + (b.duration ?? 0) : total), 0);
}

/**
 * Computes elapsed seconds for the given entry/state as of `now`.
 *
 * Running: `now − start − closed break seconds`. Paused: `openBreak.startDate − start − closed
 * break seconds`. `stopped`/`idle` have no meaningful "elapsed since start" and return `0` —
 * Awork's `duration` field for a stopped entry is not yet verified, so it is not relied on here.
 */
export function computeElapsedSeconds(entry: AworkTimeEntry | null, state: TimerState, now: Date): number {
	if (!entry || state === "idle" || state === "stopped" || state === "error") {
		return 0;
	}

	const start = parseAworkDateTime(entry.startDateUtc, entry.startTimeUtc);
	const closedBreakSeconds = sumClosedBreakSeconds(entry);

	if (state === "paused") {
		const breaks = entry.breaks ?? [];
		const openBreak = breaks[breaks.length - 1];
		const breakStart = new Date(openBreak.startDate);
		return Math.max(0, Math.floor((breakStart.getTime() - start.getTime()) / 1000) - closedBreakSeconds);
	}

	return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000) - closedBreakSeconds);
}

/**
 * What a "pause-resume" press should do against the current state, if anything.
 *
 * `stopped` resolves to `restart` (start a new entry against the same task/project/type of
 * work) rather than a no-op — the key is showing that timer's info, so pressing it is expected
 * to bring it back, not silently do nothing. `idle` has no prior entry to restart, so it stays
 * a no-op.
 */
export function decidePauseResumeAction(state: TimerState): "pause" | "resume" | "restart" | null {
	if (state === "running") {
		return "pause";
	}
	if (state === "paused") {
		return "resume";
	}
	if (state === "stopped") {
		return "restart";
	}
	return null;
}

/** Whether a "stop" press makes sense against the current state. */
export function decideStopAction(state: TimerState): "stop" | null {
	return state === "running" || state === "paused" ? "stop" : null;
}

/**
 * Whether a Task Timer key's bound task is the one actually active right now — i.e. the key
 * should render its "active" color rather than "inactive"/unbound.
 */
export function isBoundTaskActive(entry: AworkTimeEntry | null, boundTaskId: string | undefined, state: TimerState): boolean {
	if (!boundTaskId || (state !== "running" && state !== "paused")) {
		return false;
	}
	return entry?.taskId === boundTaskId;
}
