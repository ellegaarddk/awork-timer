import assert from "node:assert/strict";
import { test } from "node:test";
import { codeChallengeFromVerifier } from "./pkce.ts";

test("codeChallengeFromVerifier matches the RFC 7636 appendix B example", () => {
	// https://www.rfc-editor.org/rfc/rfc7636#appendix-B
	const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
	const expectedChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
	assert.equal(codeChallengeFromVerifier(verifier), expectedChallenge);
});
