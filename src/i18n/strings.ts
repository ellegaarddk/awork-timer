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
	taskTimer: {
		unbound: "Long Press | for | Binding",
		notBoundHelp: "Not bound yet — long-press the key while a timer is active elsewhere.",
		boundHelp: "Bound to: {task} ({project})"
	},
	propertyInspector: {
		clientIdLabel: "Awork Client ID",
		clientIdHelp:
			"Create an API client in awork under Settings → Integrations → API Clients, with redirect URI http://127.0.0.1:52305/callback.",
		connectLabel: "Awork Account",
		connectButton: "Connect to Awork",
		connectNotConnected: "Not connected yet.",
		connectOpening: "Opening awork in your browser…",
		missingClientIdError: "Missing awork client ID – enter it in the key's settings",
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
