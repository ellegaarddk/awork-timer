import type { AworkTimeEntry } from "../awork/types.js";

export type TimerState = "running" | "paused" | "stopped" | "idle" | "error";

export type TimerSnapshot = {
	state: TimerState;
	elapsedSeconds: number;
	entry: AworkTimeEntry | null;
	error?: string;
};

export type AworkOAuthTokens = {
	accessToken: string;
	refreshToken: string;
	/** Epoch ms; computed locally from the token response's `expires_in` at fetch time. */
	expiresAt: number;
};

/** Global (plugin-wide) settings; never hardcode these values, never log the tokens. */
export type GlobalSettings = {
	/** The owner's awork OAuth API Client ID (Settings → Integrations → API Clients). Not secret, but not hardcoded either — each installation may register its own. */
	oauthClientId?: string;
	oauth?: AworkOAuthTokens;
	pollIntervalSeconds?: number;
};
