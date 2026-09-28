type PressState = {
	timer: ReturnType<typeof setTimeout>;
	longPressFired: boolean;
};

/**
 * Shared short-press/long-press bookkeeping for key actions, keyed by action instance id (a
 * `SingletonAction` serves every visible key of its type, so state can't just live in one
 * timer variable). `onLongPress` fires as soon as the threshold elapses, while the key is
 * still held; `onShortPress` fires on release only when the long-press never fired.
 */
export class PressTracker {
	#pending = new Map<string, PressState>();

	onKeyDown(actionId: string, thresholdMs: number, onLongPress: () => void): void {
		const existing = this.#pending.get(actionId);
		if (existing) {
			clearTimeout(existing.timer);
		}

		const state: PressState = {
			longPressFired: false,
			timer: setTimeout(() => {
				state.longPressFired = true;
				onLongPress();
			}, thresholdMs)
		};
		this.#pending.set(actionId, state);
	}

	onKeyUp(actionId: string, onShortPress: () => void): void {
		const state = this.#pending.get(actionId);
		if (!state) {
			return;
		}
		this.#pending.delete(actionId);
		clearTimeout(state.timer);

		if (!state.longPressFired) {
			onShortPress();
		}
	}
}
