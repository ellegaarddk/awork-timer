import streamDeck from "@elgato/streamdeck";

import { ActiveTimer } from "./actions/active-timer";
import { TaskTimer } from "./actions/task-timer";
import { AworkClient } from "./awork/client";
import { runLoginFlow } from "./awork/oauth";
import type { GlobalSettings } from "./timer/types";

// "info" — never "trace" once Awork tokens are stored in settings, to avoid logging them.
streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new ActiveTimer());
streamDeck.actions.registerAction(new TaskTimer());

streamDeck.ui.onSendToPlugin<{ event?: string }>(async (ev) => {
	if (ev.payload.event !== "connectAwork") {
		return;
	}

	try {
		const oauth = await runLoginFlow();
		streamDeck.logger.info("Awork login: tokens received, saving to global settings");
		const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
		await streamDeck.settings.setGlobalSettings<GlobalSettings>({ ...settings, oauth });

		const me = await new AworkClient({ accessToken: oauth.accessToken }).getMe();
		const name = [me.firstName, me.lastName].filter(Boolean).join(" ") || "Awork";
		streamDeck.logger.info(`Awork login: connected as "${name}", replying to property inspector`);
		await streamDeck.ui.sendToPropertyInspector({ event: "connectAwork", ok: true, name });
		streamDeck.logger.info("Awork login: reply sent");
	} catch (error) {
		// Never log settings/tokens here.
		const message = error instanceof Error ? error.message : String(error);
		streamDeck.logger.error(`Awork login failed: ${message}`);
		await streamDeck.ui.sendToPropertyInspector({ event: "connectAwork", ok: false, error: message });
	}
});

streamDeck.connect();
