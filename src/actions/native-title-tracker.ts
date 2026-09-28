/**
 * Tracks each key instance's native Stream Deck title (set by the user directly in the Stream
 * Deck app, not via this plugin's property inspector) so rendering can defer to it.
 *
 * The SDK only reports this via `onTitleParametersDidChange` — there is no way to read the
 * current title on `willAppear`, so a title set before the plugin last started won't be known
 * here until Stream Deck fires that event again (e.g. the user re-saves the field, even to the
 * same value).
 */
export class NativeTitleTracker {
	#titles = new Map<string, string>();

	update(actionId: string, title: string): void {
		this.#titles.set(actionId, title);
	}

	hasTitle(actionId: string): boolean {
		return Boolean(this.#titles.get(actionId)?.trim());
	}
}
