import streamDeck from "@elgato/streamdeck";
import { AworkClient } from "../awork/client.js";
import { DEFAULT_POLL_INTERVAL_SECONDS } from "../config/defaults.js";
import { computeElapsedSeconds, deriveState } from "./state.js";
import type { AworkTimeEntry } from "../awork/types.js";
import type { GlobalSettings, TimerSnapshot } from "./types.js";

type Subscriber = (snapshot: TimerSnapshot) => void;

/**
 * One poller shared by every visible "Active Timer" key. Polls the Awork API on an interval,
 * and locally ticks every second between polls so the displayed elapsed time keeps moving.
 * Stops both timers once the last subscriber unsubscribes.
 */
export class TimerPoller {
	#subscribers = new Set<Subscriber>();
	#pollTimer: ReturnType<typeof setInterval> | undefined;
	#tickTimer: ReturnType<typeof setInterval> | undefined;
	#latestEntry: AworkTimeEntry | null = null;
	#lastError: string | undefined;

	subscribe(callback: Subscriber): () => void {
		streamDeck.logger.info(`TimerPoller: subscriber added (total ${this.#subscribers.size + 1})`);
		this.#subscribers.add(callback);
		callback(this.#buildSnapshot());

		if (this.#subscribers.size === 1) {
			this.#start().catch((error: unknown) => {
				streamDeck.logger.error(`TimerPoller: failed to start: ${error instanceof Error ? error.message : String(error)}`);
			});
		}

		return () => {
			this.#subscribers.delete(callback);
			if (this.#subscribers.size === 0) {
				streamDeck.logger.info("TimerPoller: last subscriber removed, stopping");
				this.#stop();
			}
		};
	}

	async #start(): Promise<void> {
		const { pollIntervalSeconds } = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
		const intervalMs = (pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS) * 1000;
		streamDeck.logger.info(`TimerPoller: starting, interval=${intervalMs}ms`);

		await this.#poll();
		this.#pollTimer = setInterval(() => void this.#poll(), intervalMs);
		this.#tickTimer = setInterval(() => this.#notify(), 1000);
	}

	#stop(): void {
		clearInterval(this.#pollTimer);
		clearInterval(this.#tickTimer);
		this.#pollTimer = undefined;
		this.#tickTimer = undefined;
	}

	async #poll(): Promise<void> {
		try {
			const client = await AworkClient.fromGlobalSettings();
			this.#latestEntry = await client.getLastTimeEntry();
			this.#lastError = undefined;
			streamDeck.logger.info(`TimerPoller: poll ok, entry=${this.#latestEntry ? "present" : "none"}`);
		} catch (error) {
			// Never log settings here — it may contain the API key.
			this.#lastError = error instanceof Error ? error.message : String(error);
			streamDeck.logger.error(`Awork poll failed: ${this.#lastError}`);
		}

		this.#notify();
	}

	/**
	 * Applies a time entry obtained from a control call (pause/resume/stop already return the
	 * updated entry) without waiting for the next poll tick.
	 */
	applyEntry(entry: AworkTimeEntry | null): void {
		this.#latestEntry = entry;
		this.#lastError = undefined;
		this.#notify();
	}

	#notify(): void {
		const snapshot = this.#buildSnapshot();
		for (const callback of this.#subscribers) {
			callback(snapshot);
		}
	}

	#buildSnapshot(): TimerSnapshot {
		if (this.#lastError) {
			return { state: "error", elapsedSeconds: 0, entry: this.#latestEntry, error: this.#lastError };
		}

		const state = deriveState(this.#latestEntry);
		const elapsedSeconds = computeElapsedSeconds(this.#latestEntry, state, new Date());
		return { state, elapsedSeconds, entry: this.#latestEntry };
	}
}

export const timerPoller = new TimerPoller();
