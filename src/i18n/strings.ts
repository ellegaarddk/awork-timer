/**
 * All user-facing strings, in one place, ready for Stream Deck's i18n mechanism.
 * English only for now; see the SDK's Localization guide before adding translations.
 */
export const STRINGS = {
	action: {
		name: "Active Timer",
		tooltip: "Shows the elapsed time of your active Awork timer and its state."
	},
	key: {
		idle: "No timer",
		error: "Error"
	},
	propertyInspector: {
		apiKeyLabel: "Awork API Key",
		apiKeyPlaceholder: "Settings → Integrations → Manage API Keys in awork",
		userIdLabel: "Awork User ID",
		userIdHelp:
			"Open your own profile in awork — the ID is the UUID in the page URL (…/users/{id}).",
		pollIntervalLabel: "Poll Interval (seconds)",
		colorRunningLabel: "Running Color",
		colorPausedLabel: "Paused Color",
		colorStoppedLabel: "Stopped Color",
		colorIdleLabel: "Idle Color",
		colorErrorLabel: "Error Color",
		timeFormatLabel: "Time Format",
		shortPressActionLabel: "Short Press",
		longPressActionLabel: "Long Press",
		longPressThresholdLabel: "Long Press Threshold (ms)"
	}
} as const;
