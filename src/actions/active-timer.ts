import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import type { KeyAction, KeyDownEvent, KeyUpEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { AworkClient } from "../awork/client.js";
import type { AworkTimeEntry } from "../awork/types.js";
import {
	DEFAULT_COLORS,
	DEFAULT_LONG_PRESS_ACTION,
	DEFAULT_LONG_PRESS_THRESHOLD_MS,
	DEFAULT_SHORT_PRESS_ACTION,
	DEFAULT_TIME_FORMAT,
	type PressAction,
	type TimeFormat
} from "../config/defaults.js";
import { STRINGS } from "../i18n/strings.js";
import { buildKeySvg, formatElapsed } from "../render/key-renderer.js";
import { decidePauseResumeAction, decideStopAction } from "../timer/state.js";
import { timerPoller } from "../timer/poller.js";
import type { TimerSnapshot } from "../timer/types.js";

export type ActiveTimerSettings = {
	colorRunning?: string;
	colorPaused?: string;
	colorStopped?: string;
	colorIdle?: string;
	colorError?: string;
	timeFormat?: TimeFormat;
	shortPressAction?: PressAction;
	longPressAction?: PressAction;
	longPressThresholdMs?: number;
};

type PressState = {
	timer: ReturnType<typeof setTimeout>;
	longPressFired: boolean;
};

@action({ UUID: "dk.ellegaardid.awork-timer.active-timer" })
export class ActiveTimer extends SingletonAction<ActiveTimerSettings> {
	#unsubscribe: (() => void) | undefined;
	#lastSnapshot: TimerSnapshot = { state: "idle", elapsedSeconds: 0, entry: null };
	#pressState = new Map<string, PressState>();

	override onWillAppear(ev: WillAppearEvent<ActiveTimerSettings>): void {
		streamDeck.logger.info(`ActiveTimer: onWillAppear for action ${ev.action.id}`);
		this.#unsubscribe ??= timerPoller.subscribe((snapshot) => this.#renderAll(snapshot));
	}

	override onWillDisappear(_ev: WillDisappearEvent<ActiveTimerSettings>): void {
		if (this.actions.length === 0) {
			this.#unsubscribe?.();
			this.#unsubscribe = undefined;
		}
	}

	override onKeyDown(ev: KeyDownEvent<ActiveTimerSettings>): void {
		const { settings } = ev.payload;
		const thresholdMs = settings.longPressThresholdMs ?? DEFAULT_LONG_PRESS_THRESHOLD_MS;

		const existing = this.#pressState.get(ev.action.id);
		if (existing) {
			clearTimeout(existing.timer);
		}

		const state: PressState = {
			longPressFired: false,
			timer: setTimeout(() => {
				state.longPressFired = true;
				this.#handlePress(ev.action, settings.longPressAction ?? DEFAULT_LONG_PRESS_ACTION);
			}, thresholdMs)
		};
		this.#pressState.set(ev.action.id, state);
	}

	override onKeyUp(ev: KeyUpEvent<ActiveTimerSettings>): void {
		const state = this.#pressState.get(ev.action.id);
		if (!state) {
			return;
		}
		this.#pressState.delete(ev.action.id);
		clearTimeout(state.timer);

		if (!state.longPressFired) {
			this.#handlePress(ev.action, ev.payload.settings.shortPressAction ?? DEFAULT_SHORT_PRESS_ACTION);
		}
	}

	#handlePress(action: KeyAction<ActiveTimerSettings>, configured: PressAction): void {
		if (configured === "none") {
			return;
		}

		const resolved =
			configured === "pause-resume" ? decidePauseResumeAction(this.#lastSnapshot.state) : decideStopAction(this.#lastSnapshot.state);

		if (!resolved) {
			void action.showAlert();
			return;
		}

		void this.#runControl(action, resolved, this.#lastSnapshot.entry);
	}

	async #runControl(
		action: KeyAction<ActiveTimerSettings>,
		control: "pause" | "resume" | "stop" | "restart",
		entry: AworkTimeEntry | null
	): Promise<void> {
		if (control === "restart" && !entry?.typeOfWorkId) {
			streamDeck.logger.error("ActiveTimer: restart requested but there is no prior entry to restart from");
			await action.showAlert();
			return;
		}

		try {
			const client = await AworkClient.fromGlobalSettings();
			const result =
				control === "restart" && entry
					? await client.start({
							timezone: entry.timezone,
							typeOfWorkId: entry.typeOfWorkId,
							projectId: entry.projectId,
							taskId: entry.taskId
						})
					: await client[control as "pause" | "resume" | "stop"]();
			timerPoller.applyEntry(result);
			await action.showOk();
		} catch (error) {
			// Never log settings here — it may contain the API key.
			streamDeck.logger.error(`ActiveTimer: ${control} failed: ${error instanceof Error ? error.message : String(error)}`);
			await action.showAlert();
		}
	}

	#renderAll(snapshot: TimerSnapshot): void {
		this.#lastSnapshot = snapshot;
		for (const instance of this.actions) {
			if (instance.isKey()) {
				this.#renderKey(instance, snapshot).catch((error: unknown) => {
					streamDeck.logger.error(`Failed to render Active Timer key: ${error instanceof Error ? error.message : String(error)}`);
				});
			}
		}
	}

	async #renderKey(instance: KeyAction<ActiveTimerSettings>, snapshot: TimerSnapshot): Promise<void> {
		const settings = await instance.getSettings();
		const format = settings.timeFormat ?? DEFAULT_TIME_FORMAT;

		const text =
			snapshot.state === "idle"
				? STRINGS.key.idle
				: snapshot.state === "error"
					? STRINGS.key.error
					: formatElapsed(snapshot.elapsedSeconds, format);

		const color =
			{
				running: settings.colorRunning,
				paused: settings.colorPaused,
				stopped: settings.colorStopped,
				idle: settings.colorIdle,
				error: settings.colorError
			}[snapshot.state] ?? DEFAULT_COLORS[snapshot.state];

		const label = snapshot.entry?.task?.name ?? snapshot.entry?.project?.name ?? undefined;

		await instance.setImage(buildKeySvg(text, color, label));
	}
}
