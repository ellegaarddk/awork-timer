import type { TimeFormat } from "../config/defaults.js";

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

const MAX_LABEL_CHARS = 16;

function truncateLabel(label: string): string {
	return label.length <= MAX_LABEL_CHARS ? label : `${label.slice(0, MAX_LABEL_CHARS - 1)}…`;
}

/**
 * Builds a data URI combining the state color, the main text, and an optional label (e.g. the
 * timer's task/project name) above it, ready for `setImage`.
 *
 * `setImage` does not accept a bare `<svg>` string — it must be a `data:image/svg+xml,...` URI
 * with the markup percent-encoded (per the SDK's "From SVG" example).
 */
export function buildKeySvg(text: string, backgroundColor: string, label?: string): string {
	const labelMarkup = label
		? `<text x="72" y="36" font-family="Arial, sans-serif" font-size="18" font-weight="600" fill="#ffffff" text-anchor="middle">${escapeXml(truncateLabel(label))}</text>`
		: "";
	const timeY = label ? 104 : 88;

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">
		<rect width="144" height="144" rx="16" fill="${escapeXml(backgroundColor)}" />
		${labelMarkup}
		<text x="72" y="${timeY}" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(text)}</text>
	</svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
