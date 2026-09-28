import streamDeck from "@elgato/streamdeck";
import { AWORK_BASE_URL } from "../config/defaults.js";
import type { GlobalSettings } from "../timer/types.js";
import type { AworkTimeEntry } from "./types.js";

export type AworkClientOptions = {
	apiKey: string;
	/**
	 * The plugin owner's Awork user ID.
	 *
	 * An Awork API key authenticates as a separate, non-user-specific API user with admin-level
	 * access — it is NOT the same identity as `/me`. Every user of this plugin must supply their
	 * own Awork user ID as a setting; it cannot be derived from the API key.
	 */
	userId: string;
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

export class AworkClient {
	readonly #apiKey: string;
	readonly #userId: string;
	readonly #baseUrl: string;

	constructor(options: AworkClientOptions) {
		this.#apiKey = options.apiKey;
		this.#userId = options.userId;
		this.#baseUrl = options.baseUrl ?? AWORK_BASE_URL;
	}

	/**
	 * Gets the owner's latest time entry.
	 * @returns The entry, or `null` when the user has never tracked time.
	 */
	async getLastTimeEntry(): Promise<AworkTimeEntry | null> {
		const response = await fetch(`${this.#baseUrl}/users/${this.#userId}/timeentries/last`, {
			headers: { Authorization: `Bearer ${this.#apiKey}` }
		});

		if (response.status === 404) {
			return null;
		}

		if (!response.ok) {
			throw new AworkApiError(`Awork API request failed with status ${response.status}`, response.status);
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
		const response = await fetch(`${this.#baseUrl}/users/${this.#userId}/timetracking/start`, {
			method: "POST",
			headers: { Authorization: `Bearer ${this.#apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			throw new AworkApiError(`Awork start request failed with status ${response.status}`, response.status);
		}

		return (await response.json()) as AworkTimeEntry;
	}

	/**
	 * `pause`/`resume` take no request body at all per the Awork OpenAPI spec (not even an
	 * optional one) — sending one (as the old PowerShell script did) is the likely cause of the
	 * old "pause/resume don't work" behaviour, so none is sent here.
	 */
	async #control(action: "pause" | "resume" | "stop"): Promise<AworkTimeEntry> {
		const response = await fetch(`${this.#baseUrl}/users/${this.#userId}/timetracking/${action}`, {
			method: "POST",
			headers: { Authorization: `Bearer ${this.#apiKey}` }
		});

		if (!response.ok) {
			throw new AworkApiError(`Awork ${action} request failed with status ${response.status}`, response.status);
		}

		return (await response.json()) as AworkTimeEntry;
	}

	/**
	 * Builds a client from the plugin's global settings.
	 * @throws When the API key or user ID has not been configured yet.
	 */
	static async fromGlobalSettings(): Promise<AworkClient> {
		const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
		if (!settings.apiKey || !settings.userId) {
			throw new Error("Awork API key or user ID is not configured yet");
		}
		return new AworkClient({ apiKey: settings.apiKey, userId: settings.userId });
	}
}
