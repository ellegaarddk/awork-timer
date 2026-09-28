import assert from "node:assert/strict";
import { test } from "node:test";
import type { AworkTimeEntry } from "../awork/types.ts";
import { computeElapsedSeconds, decidePauseResumeAction, decideStopAction, deriveState, parseAworkDateTime } from "./state.ts";

function entry(overrides: Partial<AworkTimeEntry> = {}): AworkTimeEntry {
	return {
		id: "entry-1",
		startDateUtc: "2026-09-28T00:00:00Z",
		startTimeUtc: "07:00:00.0000000",
		duration: 0,
		breaks: [],
		timezone: "Europe/Copenhagen",
		typeOfWorkId: "type-of-work-1",
		...overrides
	};
}

test("parseAworkDateTime combines date and time, truncating fractional seconds", () => {
	const date = parseAworkDateTime("2026-09-28T00:00:00Z", "07:09:28.3515950");
	assert.equal(date.toISOString(), "2026-09-28T07:09:28.351Z");
});

test("deriveState: idle when there is no entry", () => {
	assert.equal(deriveState(null), "idle");
});

test("deriveState: stopped when endDateUtc is set", () => {
	assert.equal(deriveState(entry({ endDateUtc: "2026-09-28T09:00:00Z" })), "stopped");
});

test("deriveState: paused when the last break has no endDate", () => {
	assert.equal(
		deriveState(entry({ breaks: [{ startDate: "2026-09-28T07:13:35Z" }] })),
		"paused"
	);
});

test("deriveState: running when there are no open breaks", () => {
	assert.equal(
		deriveState(
			entry({ breaks: [{ startDate: "2026-09-28T07:13:35Z", endDate: "2026-09-28T07:14:03Z", duration: 27 }] })
		),
		"running"
	);
});

test("computeElapsedSeconds: running subtracts closed break time", () => {
	const now = new Date("2026-09-28T08:00:00Z");
	const e = entry({
		breaks: [{ startDate: "2026-09-28T07:13:35Z", endDate: "2026-09-28T07:14:03Z", duration: 27 }]
	});
	// 08:00:00 - 07:00:00 = 3600s, minus 27s closed break = 3573s
	assert.equal(computeElapsedSeconds(e, "running", now), 3573);
});

test("computeElapsedSeconds: paused stops counting at the open break's start", () => {
	const now = new Date("2026-09-28T09:00:00Z"); // must be ignored while paused
	const e = entry({ breaks: [{ startDate: "2026-09-28T07:30:00Z" }] });
	// 07:30:00 - 07:00:00 = 1800s
	assert.equal(computeElapsedSeconds(e, "paused", now), 1800);
});

test("computeElapsedSeconds: idle/stopped/error are always 0", () => {
	const now = new Date("2026-09-28T09:00:00Z");
	assert.equal(computeElapsedSeconds(null, "idle", now), 0);
	assert.equal(computeElapsedSeconds(entry(), "stopped", now), 0);
	assert.equal(computeElapsedSeconds(entry(), "error", now), 0);
});

test("decidePauseResumeAction: pauses/resumes/restarts, or nothing when idle/error", () => {
	assert.equal(decidePauseResumeAction("running"), "pause");
	assert.equal(decidePauseResumeAction("paused"), "resume");
	assert.equal(decidePauseResumeAction("stopped"), "restart");
	assert.equal(decidePauseResumeAction("idle"), null);
	assert.equal(decidePauseResumeAction("error"), null);
});

test("decideStopAction: stops when running or paused, otherwise nothing", () => {
	assert.equal(decideStopAction("running"), "stop");
	assert.equal(decideStopAction("paused"), "stop");
	assert.equal(decideStopAction("stopped"), null);
	assert.equal(decideStopAction("idle"), null);
	assert.equal(decideStopAction("error"), null);
});
