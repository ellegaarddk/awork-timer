import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import type { KeyAction, KeyDownEvent, KeyUpEvent, TitleParametersDidChangeEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { AworkClient } from "../awork/client.js";
import { DEFAULT_LONG_PRESS_THRESHOLD_MS, DEFAULT_TASK_TIMER_COLORS } from "../config/defaults.js";
import { STRINGS } from "../i18n/strings.js";
import { buildBackgroundSvg, buildKeySvg } from "../render/key-renderer.js";
import { isBoundTaskActive } from "../timer/state.js";
import { timerPoller } from "../timer/poller.js";
import { NativeTitleTracker } from "./native-title-tracker.js";
import { PressTracker } from "./press-tracker.js";
import type { TimerSnapshot } from "../timer/types.js";

export type TaskTimerSettings = {
	taskId?: string;
	taskName?: string;
	projectId?: string | null;
	projectName?: string;
	typeOfWorkId?: string;
	timezone?: string;
	customTitle?: string;
	colorActive?: string;
	colorInactive?: string;
	longPressThresholdMs?: number;
};

@action({ UUID: "dk.ellegaardid.awork-timer.task-timer" })
export class TaskTimer extends SingletonAction<TaskTimerSettings> {
	#unsubscribe: (() => void) | undefined;
	#lastSnapshot: TimerSnapshot = { state: "idle", elapsedSeconds: 0, entry: null };
	#pressTracker = new PressTracker();
	#nativeTitles = new NativeTitleTracker();

	override onWillAppear(ev: WillAppearEvent<TaskTimerSettings>): void {
		streamDeck.logger.info(`TaskTimer: onWillAppear for action ${ev.action.id}`);
		this.#unsubscribe ??= timerPoller.subscribe((snapshot) => this.#renderAll(snapshot));
	}

	override onTitleParametersDidChange(ev: TitleParametersDidChangeEvent<TaskTimerSettings>): void {
		this.#nativeTitles.update(ev.action.id, ev.payload.title);
		this.#renderAll(this.#lastSnapshot);
	}

	override onWillDisappear(_ev: WillDisappearEvent<TaskTimerSettings>): void {
		if (this.actions.length === 0) {
			this.#unsubscribe?.();
			this.#unsubscribe = undefined;
		}
	}

	override onKeyDown(ev: KeyDownEvent<TaskTimerSettings>): void {
		const thresholdMs = ev.payload.settings.longPressThresholdMs ?? DEFAULT_LONG_PRESS_THRESHOLD_MS;
		this.#pressTracker.onKeyDown(ev.action.id, thresholdMs, () => {
			this.#bindToActiveTask(ev.action).catch((error: unknown) => {
				streamDeck.logger.error(`TaskTimer: bind failed: ${error instanceof Error ? error.message : String(error)}`);
				void ev.action.showAlert();
			});
		});
	}

	override onKeyUp(ev: KeyUpEvent<TaskTimerSettings>): void {
		this.#pressTracker.onKeyUp(ev.action.id, () => {
			void this.#startBoundTask(ev.action);
		});
	}

	/** Long press: "sticks" whatever task is currently running/paused elsewhere to this key. */
	async #bindToActiveTask(keyAction: KeyAction<TaskTimerSettings>): Promise<void> {
		const { state, entry } = this.#lastSnapshot;
		if ((state !== "running" && state !== "paused") || !entry?.taskId || !entry.typeOfWorkId) {
			await keyAction.showAlert();
			return;
		}

		const settings = await keyAction.getSettings();
		await keyAction.setSettings({
			...settings,
			// Each rebind starts fresh: the custom title belonged to the previous binding.
			customTitle: undefined,
			taskId: entry.taskId,
			taskName: entry.task?.name,
			projectId: entry.projectId,
			projectName: entry.project?.name,
			typeOfWorkId: entry.typeOfWorkId,
			timezone: entry.timezone
		});
		await keyAction.showOk();
	}

	/** Short press: starts tracking the bound task. */
	async #startBoundTask(keyAction: KeyAction<TaskTimerSettings>): Promise<void> {
		const settings = await keyAction.getSettings();
		if (!settings.taskId || !settings.typeOfWorkId || !settings.timezone) {
			await keyAction.showAlert();
			return;
		}

		try {
			const client = await AworkClient.fromGlobalSettings();
			const entry = await client.start({
				timezone: settings.timezone,
				typeOfWorkId: settings.typeOfWorkId,
				projectId: settings.projectId,
				taskId: settings.taskId
			});
			timerPoller.applyEntry(entry);
			await keyAction.showOk();
		} catch (error) {
			// Never log settings here — it may contain the API key.
			streamDeck.logger.error(`TaskTimer: start failed: ${error instanceof Error ? error.message : String(error)}`);
			await keyAction.showAlert();
		}
	}

	#renderAll(snapshot: TimerSnapshot): void {
		this.#lastSnapshot = snapshot;
		for (const instance of this.actions) {
			if (instance.isKey()) {
				this.#renderKey(instance, snapshot).catch((error: unknown) => {
					streamDeck.logger.error(`Failed to render Task Timer key: ${error instanceof Error ? error.message : String(error)}`);
				});
			}
		}
	}

	async #renderKey(instance: KeyAction<TaskTimerSettings>, snapshot: TimerSnapshot): Promise<void> {
		const settings = await instance.getSettings();
		const active = isBoundTaskActive(snapshot.entry, settings.taskId, snapshot.state);
		const color = active ? settings.colorActive ?? DEFAULT_TASK_TIMER_COLORS.active : settings.colorInactive ?? DEFAULT_TASK_TIMER_COLORS.inactive;

		// A native Stream Deck title (set by the user in the Stream Deck app itself, not this
		// plugin) always wins — we can't clear it, so don't draw our own text underneath it.
		if (this.#nativeTitles.hasTitle(instance.id)) {
			await instance.setImage(buildBackgroundSvg(color));
			return;
		}

		const text = settings.customTitle || settings.taskName || STRINGS.taskTimer.unbound;
		const label = settings.taskId ? settings.projectName : undefined;

		await instance.setTitle("");
		await instance.setImage(buildKeySvg(text, color, label, { centered: true }));
	}
}
