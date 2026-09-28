import streamDeck from "@elgato/streamdeck";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TimeFormat } from "../config/defaults.js";

/**
 * The eID logo, watermarked faintly behind the key's text. Sourced from
 * `imgs/branding/eid-logo.svg` — a copy of the brand's favicon with its hardcoded near-black
 * fill removed so it can be tinted white here (the original color would be invisible against
 * our dark key backgrounds).
 *
 * Positioned with a plain `translate(...) scale(...)` rather than a nested `<svg>` with its own
 * viewBox — Stream Deck's key-image pipeline is a more limited SVG renderer than a browser, and
 * nested-`<svg>` auto-scaling is a common thing such renderers drop silently rather than error.
 * The source is authored at 447.4284 x 509.297984; scale 0.2 renders it at ~89 x 102.
 */
const LOGO_MARKUP = loadLogoMarkup();

function loadLogoMarkup(): string {
	const logoPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../imgs/branding/eid-logo.svg");
	try {
		const raw = readFileSync(logoPath, "utf-8");
		const match = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(raw);
		const inner = match?.[1] ?? "";
		streamDeck.logger.info(
			inner ? `key-renderer: logo loaded from ${logoPath} (${inner.length} chars)` : `key-renderer: logo file read but markup extraction failed: ${logoPath}`
		);
		return inner;
	} catch (error) {
		streamDeck.logger.error(`key-renderer: failed to load logo from ${logoPath}: ${error instanceof Error ? error.message : String(error)}`);
		return "";
	}
}

export function formatElapsed(totalSeconds: number, format: TimeFormat): string {
	const safeSeconds = Math.max(0, Math.floor(totalSeconds));
	const hours = Math.floor(safeSeconds / 3600);
	const minutes = Math.floor((safeSeconds % 3600) / 60);
	const mm = String(minutes).padStart(2, "0");

	if (format === "h:mm:ss") {
		const seconds = safeSeconds % 60;
		return `${hours}:${mm}:${String(seconds).padStart(2, "0")}`;
	}

	return `${hours}:${mm}`;
}

function escapeXml(value: string): string {
	return value.replace(
		/[<>&'"]/g,
		(char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char] ?? char
	);
}

const LABEL_FONT_SIZE = 15;
const LABEL_LINE_HEIGHT = 17;
const LABEL_MAX_CHARS = 14;
const LABEL_MAX_LINES = 2;
const LABEL_CENTER_Y = 34;

/** Renders the label (e.g. task/project name), wrapping onto up to two lines rather than truncating. */
function buildLabelMarkup(label: string): string {
	if (label.length <= LABEL_MAX_CHARS) {
		return `<text x="72" y="${LABEL_CENTER_Y}" font-family="Arial, sans-serif" font-size="18" font-weight="600" fill="#ffffff" text-anchor="middle">${escapeXml(label)}</text>`;
	}

	const lines = wrapWords(label, LABEL_MAX_CHARS, LABEL_MAX_LINES);
	const startY = LABEL_CENTER_Y - ((lines.length - 1) * LABEL_LINE_HEIGHT) / 2;
	return lines
		.map((line, i) => {
			const y = startY + i * LABEL_LINE_HEIGHT;
			return `<text x="72" y="${y}" font-family="Arial, sans-serif" font-size="${LABEL_FONT_SIZE}" font-weight="600" fill="#ffffff" text-anchor="middle">${escapeXml(line)}</text>`;
		})
		.join("");
}

const MULTILINE_FONT_SIZE = 22;
const MULTILINE_LINE_HEIGHT = 26;
const MULTILINE_MAX_CHARS = 14;
const MULTILINE_MAX_LINES = 3;

/** Greedily wraps `text` onto up to `maxLines` lines of at most `maxCharsPerLine` characters. */
function wrapWords(text: string, maxCharsPerLine: number, maxLines: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let current = "";

	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (candidate.length <= maxCharsPerLine || !current) {
			current = candidate;
		} else {
			lines.push(current);
			current = word;
		}
	}
	if (current) {
		lines.push(current);
	}

	if (lines.length > maxLines) {
		const kept = lines.slice(0, maxLines);
		const last = kept[maxLines - 1] ?? "";
		kept[maxLines - 1] = last.length > maxCharsPerLine - 1 ? `${last.slice(0, maxCharsPerLine - 1)}…` : `${last}…`;
		return kept;
	}

	return lines.map((line) => (line.length <= maxCharsPerLine ? line : `${line.slice(0, maxCharsPerLine - 1)}…`));
}

function stackedLinesMarkup(lines: string[], centerY: number): string {
	const startY = centerY - ((lines.length - 1) * MULTILINE_LINE_HEIGHT) / 2;
	return lines
		.map((line, i) => {
			const y = startY + i * MULTILINE_LINE_HEIGHT;
			return `<text x="72" y="${y}" font-family="Arial, sans-serif" font-size="${MULTILINE_FONT_SIZE}" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(line)}</text>`;
		})
		.join("");
}

/**
 * Renders the main text block, vertically centered on `centerY` regardless of line count.
 *
 * `|` in `text` splits it into deliberate, manually-authored lines (e.g. the Task Timer
 * "unbound" placeholder). Otherwise short text (a clock string like Active Timer's "1:23:45")
 * renders as one line at full size; longer text (a real task name or custom title) word-wraps
 * onto up to three lines rather than truncating a single line unreadably.
 */
function buildMainTextMarkup(text: string, centerY: number): string {
	const manualLines = text
		.split("|")
		.map((line) => line.trim())
		.filter(Boolean);

	if (manualLines.length > 1) {
		return stackedLinesMarkup(manualLines.map((line) => (line.length <= MULTILINE_MAX_CHARS ? line : `${line.slice(0, MULTILINE_MAX_CHARS - 1)}…`)), centerY);
	}

	if (text.length <= 7) {
		return `<text x="72" y="${centerY}" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(text)}</text>`;
	}
	if (text.length <= 12) {
		return `<text x="72" y="${centerY}" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(text)}</text>`;
	}

	return stackedLinesMarkup(wrapWords(text, MULTILINE_MAX_CHARS, MULTILINE_MAX_LINES), centerY);
}

/** Vertical center used when `centered` is requested — otherwise position depends on the label. */
const MAIN_TEXT_CENTER_Y = 78;

/**
 * Builds a data URI combining the state color, the main text, and an optional label (e.g. the
 * timer's task/project name) above it, ready for `setImage`.
 *
 * `setImage` does not accept a bare `<svg>` string — it must be a `data:image/svg+xml,...` URI
 * with the markup percent-encoded (per the SDK's "From SVG" example).
 *
 * By default the main text sits low, leaving room for the label above it — right for Active
 * Timer's short elapsed-time text. Task Timer's task name/title can wrap onto several lines, so
 * it opts into `centered: true` to sit at a fixed vertical middle regardless of line count.
 */
export function buildKeySvg(text: string, backgroundColor: string, label?: string, options?: { centered?: boolean }): string {
	const labelMarkup = label ? buildLabelMarkup(label) : "";
	const centerY = options?.centered ? MAIN_TEXT_CENTER_Y : label ? 104 : 88;

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">
		${backgroundMarkup(backgroundColor)}
		${labelMarkup}
		${buildMainTextMarkup(text, centerY)}
	</svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function backgroundMarkup(backgroundColor: string): string {
	const logoMarkup = LOGO_MARKUP
		? `<g opacity="0.16" fill="#ffffff" transform="translate(27,21) scale(0.2)">${LOGO_MARKUP}</g>`
		: "";
	return `<rect width="144" height="144" rx="16" fill="${escapeXml(backgroundColor)}" />${logoMarkup}`;
}

/**
 * Just the colored background + logo watermark, no text at all — used when a key's native
 * Stream Deck title (set by the user in the Stream Deck app itself) takes over, so our own text
 * doesn't render underneath/behind it.
 */
export function buildBackgroundSvg(backgroundColor: string): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">${backgroundMarkup(backgroundColor)}</svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
