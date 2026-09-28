import { randomBytes } from "node:crypto";
import http from "node:http";
import open from "open";
import {
	AWORK_OAUTH_AUTHORIZE_URL,
	AWORK_OAUTH_CLIENT_ID,
	AWORK_OAUTH_REDIRECT_PORT,
	AWORK_OAUTH_REDIRECT_URI,
	AWORK_OAUTH_SCOPE,
	AWORK_OAUTH_TOKEN_URL
} from "../config/defaults.js";
import { codeChallengeFromVerifier, generateCodeVerifier } from "./pkce.js";
import type { AworkOAuthTokens } from "../timer/types.js";

const LOGIN_TIMEOUT_MS = 2 * 60 * 1000;

type TokenResponse = {
	access_token: string;
	refresh_token: string;
	expires_in: number;
};

function toTokens(response: TokenResponse): AworkOAuthTokens {
	return {
		accessToken: response.access_token,
		refreshToken: response.refresh_token,
		expiresAt: Date.now() + response.expires_in * 1000
	};
}

async function exchangeToken(params: Record<string, string>): Promise<AworkOAuthTokens> {
	const response = await fetch(AWORK_OAUTH_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(params).toString()
	});

	if (!response.ok) {
		const bodyText = await response.text().catch(() => "");
		throw new Error(`Awork token request failed with status ${response.status}: ${bodyText}`);
	}

	return toTokens((await response.json()) as TokenResponse);
}

export function refreshTokens(refreshToken: string): Promise<AworkOAuthTokens> {
	return exchangeToken({
		client_id: AWORK_OAUTH_CLIENT_ID,
		grant_type: "refresh_token",
		refresh_token: refreshToken
	});
}

/**
 * Runs the interactive PKCE login flow: opens the system browser to awork's consent screen,
 * catches the redirect on a one-shot local server, then exchanges the code for tokens.
 */
export async function runLoginFlow(): Promise<AworkOAuthTokens> {
	const verifier = generateCodeVerifier();
	const challenge = codeChallengeFromVerifier(verifier);
	const state = randomBytes(16).toString("base64url");

	const code = await waitForRedirectCode(state);
	return exchangeToken({
		client_id: AWORK_OAUTH_CLIENT_ID,
		grant_type: "authorization_code",
		code,
		redirect_uri: AWORK_OAUTH_REDIRECT_URI,
		code_verifier: verifier
	});

	async function waitForRedirectCode(expectedState: string): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			const server = http.createServer((req, res) => {
				const url = new URL(req.url ?? "/", AWORK_OAUTH_REDIRECT_URI);
				if (url.pathname !== "/callback") {
					res.writeHead(404).end();
					return;
				}

				const returnedState = url.searchParams.get("state");
				const code = url.searchParams.get("code");
				const error = url.searchParams.get("error");

				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				res.end(
					error || !code
						? "<html><body>Awork login failed. You can close this tab and try again.</body></html>"
						: "<html><body>Connected to Awork — you can close this tab.</body></html>"
				);

				clearTimeout(timeout);
				server.close();

				if (error) {
					reject(new Error(`Awork login was denied or failed: ${error}`));
				} else if (!code || returnedState !== expectedState) {
					reject(new Error("Awork login response was missing a code or had a mismatched state"));
				} else {
					resolve(code);
				}
			});

			const timeout = setTimeout(() => {
				server.close();
				reject(new Error("Awork login timed out — please try again"));
			}, LOGIN_TIMEOUT_MS);

			server.listen(AWORK_OAUTH_REDIRECT_PORT, "127.0.0.1", () => {
				const authorizeUrl = new URL(AWORK_OAUTH_AUTHORIZE_URL);
				authorizeUrl.searchParams.set("client_id", AWORK_OAUTH_CLIENT_ID);
				authorizeUrl.searchParams.set("redirect_uri", AWORK_OAUTH_REDIRECT_URI);
				authorizeUrl.searchParams.set("scope", AWORK_OAUTH_SCOPE);
				authorizeUrl.searchParams.set("response_type", "code");
				authorizeUrl.searchParams.set("grant_type", "authorization_code");
				authorizeUrl.searchParams.set("state", expectedState);
				authorizeUrl.searchParams.set("code_challenge", challenge);
				authorizeUrl.searchParams.set("code_challenge_method", "S256");

				open(authorizeUrl.toString()).catch((err: unknown) => {
					clearTimeout(timeout);
					server.close();
					reject(err instanceof Error ? err : new Error(String(err)));
				});
			});

			server.on("error", (err) => {
				clearTimeout(timeout);
				reject(err);
			});
		});
	}
}
