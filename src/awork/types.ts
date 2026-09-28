/** Typed subset of the Awork time entry response actually used by this plugin. */

export type AworkBreak = {
	startDate: string;
	/** Present once the break has ended. */
	endDate?: string;
	/** Seconds; present once the break has ended. */
	duration?: number;
};

export type AworkTimeEntry = {
	id: string;
	/** Date part only; time is `00:00:00Z`. Combine with {@link startTimeUtc}. */
	startDateUtc: string;
	/** e.g. `"07:09:28.3515950"` — up to 7 fractional digits, not directly `Date.parse`-safe. */
	startTimeUtc: string;
	endDateUtc?: string | null;
	/** Always `0` while the entry is active; elapsed time must be computed locally. */
	duration: number;
	breakDuration?: number | null;
	breaks?: AworkBreak[];
	task?: { name: string } | null;
	project?: { name: string } | null;
	typeOfWork?: { name: string } | null;
	/** Required to re-`start` tracking against the same task/project/type of work. */
	timezone: string;
	typeOfWorkId: string;
	projectId?: string | null;
	taskId?: string | null;
};
