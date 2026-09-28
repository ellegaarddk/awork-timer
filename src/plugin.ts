import streamDeck from "@elgato/streamdeck";

import { ActiveTimer } from "./actions/active-timer";

// "info" — never "trace" once the Awork API key is stored in settings, to avoid logging it.
streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new ActiveTimer());

streamDeck.connect();
