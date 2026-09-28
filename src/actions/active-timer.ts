import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import type { KeyAction, KeyDownEvent, KeyUpEvent, TitleParametersDidChangeEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
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
import { buildBackgroundSvg, buildKeySvg, formatElapsed } from "../render/key-renderer.js";
import { decidePauseResumeAction, decideStopAction } from "../timer/state.js";
import { timerPoller } from "../timer/poller.js";
import { NativeTitleTracker } from "./native-title-tracker.js";
import { PressTracker } from "./press-tracker.js";
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

@action({ UUID: "dk.ellegaardid.awork-timer.active-timer" })
export class ActiveTimer extends SingletonAction<ActiveTimerSettings> {
	#unsubscribe: (() => void) | undefined;
	#lastSnapshot: TimerSnapshot = { state: "idle", elapsedSeconds: 0, entry: null };
	#pressTracker = new PressTracker();
	#nativeTitles = new NativeTitleTracker();

	override onWillAppear(ev: WillAppearEvent<ActiveTimerSettings>): void {
		streamDeck.logger.info(`ActiveTimer: onWillAppear for action ${ev.action.id}`);
		this.#unsubscribe ??= timerPoller.subscribe((snapshot) => this.#renderAll(snapshot));
	}

	override onTitleParametersDidChange(ev: TitleParametersDidChangeEvent<ActiveTimerSettings>): void {
		this.#nativeTitles.update(ev.action.id, ev.payload.title);
		this.#renderAll(this.#lastSnapshot);
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

		this.#pressTracker.onKeyDown(ev.action.id, thresholdMs, () => {
			this.#handlePress(ev.action, settings.longPressAction ?? DEFAULT_LONG_PRESS_ACTION);
		});
	}

	override onKeyUp(ev: KeyUpEvent<ActiveTimerSettings>): void {
		this.#pressTracker.onKeyUp(ev.action.id, () => {
			this.#handlePress(ev.action, ev.payload.settings.shortPressAction ?? DEFAULT_SHORT_PRESS_ACTION);
		});
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

		const color =
			{
				running: settings.colorRunning,
				paused: settings.colorPaused,
				stopped: settings.colorStopped,
				idle: settings.colorIdle,
				error: settings.colorError
			}[snapshot.state] ?? DEFAULT_COLORS[snapshot.state];

		// A native Stream Deck title (set by the user in the Stream Deck app itself, not this
		// plugin) always wins — we can't clear it, so don't draw our own text underneath it.
		if (this.#nativeTitles.hasTitle(instance.id)) {
			await instance.setImage(buildBackgroundSvg(color));
			return;
		}

		const format = settings.timeFormat ?? DEFAULT_TIME_FORMAT;
		const text =
			snapshot.state === "idle"
				? STRINGS.key.idle
				: snapshot.state === "error"
					? STRINGS.key.error
					: formatElapsed(snapshot.elapsedSeconds, format);
		const label = snapshot.entry?.task?.name ?? snapshot.entry?.project?.name ?? undefined;

		await instance.setTitle("");
		await instance.setImage(buildKeySvg(text, color, label));
	}
}
