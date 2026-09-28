import streamDeck from "@elgato/streamdeck";
import { AWORK_BASE_URL, AWORK_OAUTH_REFRESH_SKEW_MS } from "../config/defaults.js";
import { refreshTokens } from "./oauth.js";
import type { GlobalSettings } from "../timer/types.js";
import type { AworkTimeEntry } from "./types.js";

export type AworkClientOptions = {
	accessToken: string;
	baseUrl?: string;
};

export class AworkApiError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = "AworkApiError";
	}
}

export class AworkNotConnectedError extends Error {
	constructor() {
		super("Not connected to Awork yet — open this key's settings and click \"Connect to Awork\"");
		this.name = "AworkNotConnectedError";
	}
}

/** Builds an `AworkApiError` including Awork's own error body text, for real diagnosability. */
async function toApiError(action: string, response: Response): Promise<AworkApiError> {
	const bodyText = await response.text().catch(() => "");
	return new AworkApiError(`Awork ${action} request failed with status ${response.status}: ${bodyText}`, response.status);
}

/**
 * Talks to Awork as the owner themselves, via an OAuth access token — never a workspace API
 * key. An API key authenticates as a separate, non-user-specific "API Client" identity; Awork's
 * timer-control endpoints reject that identity with "you can only pause/resume/stop your own
 * time trackings" for anyone but the caller itself, and `resume` is documented as `/me`-only
 * regardless. Using the owner's own OAuth token makes every `/me/...` call genuinely be them.
 */
export class AworkClient {
	readonly #accessToken: string;
	readonly #baseUrl: string;

	constructor(options: AworkClientOptions) {
		this.#accessToken = options.accessToken;
		this.#baseUrl = options.baseUrl ?? AWORK_BASE_URL;
	}

	/** Gets the connected owner's display name, e.g. to confirm a successful login. */
	async getMe(): Promise<{ firstName: string | null; lastName: string | null }> {
		const response = await fetch(`${this.#baseUrl}/me`, {
			headers: { Authorization: `Bearer ${this.#accessToken}` }
		});

		if (!response.ok) {
			throw await toApiError("me", response);
		}

		return (await response.json()) as { firstName: string | null; lastName: string | null };
	}

	/**
	 * Gets the owner's latest time entry.
	 * @returns The entry, or `null` when the user has never tracked time.
	 */
	async getLastTimeEntry(): Promise<AworkTimeEntry | null> {
		const response = await fetch(`${this.#baseUrl}/me/timeentries/last`, {
			headers: { Authorization: `Bearer ${this.#accessToken}` }
		});

		if (response.status === 404) {
			return null;
		}

		if (!response.ok) {
			throw await toApiError("timeentries/last", response);
		}

		const body: unknown = await response.json();
		if (!body) {
			return null;
		}

		return body as AworkTimeEntry;
	}

	pause(): Promise<AworkTimeEntry> {
		return this.#control("pause");
	}

	resume(): Promise<AworkTimeEntry> {
		return this.#control("resume");
	}

	stop(): Promise<AworkTimeEntry> {
		return this.#control("stop");
	}

	/** Starts a new time entry, e.g. to "restart" a stopped one against the same work. */
	async start(payload: { timezone: string; typeOfWorkId: string; projectId?: string | null; taskId?: string | null }): Promise<AworkTimeEntry> {
		const response = await fetch(`${this.#baseUrl}/me/timetracking/start`, {
			method: "POST",
			headers: { Authorization: `Bearer ${this.#accessToken}`, "Content-Type": "application/json" },
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			throw await toApiError("start", response);
		}

		return (await response.json()) as AworkTimeEntry;
	}

	async #control(action: "pause" | "resume" | "stop"): Promise<AworkTimeEntry> {
		const response = await fetch(`${this.#baseUrl}/me/timetracking/${action}`, {
			method: "POST",
			headers: { Authorization: `Bearer ${this.#accessToken}` }
		});

		if (!response.ok) {
			throw await toApiError(action, response);
		}

		return (await response.json()) as AworkTimeEntry;
	}

	/**
	 * Builds a client from the plugin's global settings, refreshing (and persisting) the access
	 * token first when it's near expiry.
	 * @throws {AworkNotConnectedError} When the owner hasn't connected their Awork account yet.
	 */
	static async fromGlobalSettings(): Promise<AworkClient> {
		const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
		if (!settings.oauth) {
			throw new AworkNotConnectedError();
		}

		let { oauth } = settings;
		if (Date.now() >= oauth.expiresAt - AWORK_OAUTH_REFRESH_SKEW_MS) {
			oauth = await refreshTokens(oauth.refreshToken);
			await streamDeck.settings.setGlobalSettings<GlobalSettings>({ ...settings, oauth });
		}

		return new AworkClient({ accessToken: oauth.accessToken });
	}
}
