import sleep from '#helpers/utils/sleep'

/**
 * Process-wide adaptive cooldown against upstream rate limiting.
 *
 * Audible signals rate limiting with 503 (and occasionally 429). Measured on
 * the dev stack: sustained request velocity keeps the per-IP window closed,
 * and the window is on the order of minutes — a fixed 1-8s retry ladder
 * grinds against it forever. This module grows an inter-item cooldown
 * exponentially while rate-limited and decays it on success, so a closed
 * window is met with progressively longer waits instead of a constant
 * hammering cadence.
 *
 * State is deliberately process-global: every HTTP fetch in the worker
 * (scheduler walk, backfill) shares one upstream reputation per IP, so a
 * 503 seen by any request must raise the bar for all of them.
 *
 * Registration happens inside fetchPlus (the single choke point for upstream
 * HTTP); batch loops only read getCooldownMs() and sleep it between items.
 */
const DEFAULT_BASE_MS = 120_000
const DEFAULT_MAX_MS = 7_200_000

/** Ladder base: first consecutive rate-limit response waits this long.
 * 2 minutes — the soak of 2026-10-06/07 showed sub-minute waits never
 * cleared the wall (it stayed closed through 19h of 30s-240s knock cycles). */
export const RATE_LIMIT_COOLDOWN_BASE_MS = parsePositiveEnv(
	process.env.RATE_LIMIT_COOLDOWN_BASE_MS,
	DEFAULT_BASE_MS
)
/** Ladder ceiling: 2 hours. The dev stack's compose can set this higher via
 * env; the point of the ceiling is bounding a pathological upstream, not
 * tuning the sweet spot. */
export const RATE_LIMIT_COOLDOWN_MAX_MS = parsePositiveEnv(
	process.env.RATE_LIMIT_COOLDOWN_MAX_MS,
	DEFAULT_MAX_MS
)

function parsePositiveEnv(raw: string | undefined, fallback: number): number {
	if (!raw) return fallback
	const parsed = Number(raw)
	if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed <= 0) return fallback
	return parsed
}

let consecutiveRateLimited = 0
let cooldownMs = 0

/** Optional logger notified when the cooldown grows, for ops visibility. */
let notify: ((message: string) => void) | null = null

export function setCooldownLogger(notifyFn: (message: string) => void): void {
	notify = notifyFn
}

/**
 * Record a rate-limit response (429/503/504). Each consecutive one doubles
 * the inter-item cooldown: base, 2×base, 4×base, … capped at max. A response
 * that carries an explicit Retry-After hints at the server's own window; the
 * cooldown never drops below that hint.
 * @returns the new cooldown in milliseconds
 */
export function registerRateLimited(retryAfterMs?: number): number {
	consecutiveRateLimited += 1
	const grown = RATE_LIMIT_COOLDOWN_BASE_MS * 2 ** (consecutiveRateLimited - 1)
	cooldownMs = Math.min(grown, RATE_LIMIT_COOLDOWN_MAX_MS)
	if (retryAfterMs && retryAfterMs > cooldownMs) {
		cooldownMs = Math.min(retryAfterMs, RATE_LIMIT_COOLDOWN_MAX_MS)
	}
	notify?.(`Upstream rate limited; adaptive cooldown now ${Math.round(cooldownMs / 1000)}s`)
	return cooldownMs
}

/**
 * Record a successful (2xx) response. Halve the cooldown and clear the
 * consecutive counter so a single later 503 starts the ladder from base,
 * not from where a long failure streak left it.
 * @returns the new cooldown in milliseconds
 */
export function registerSuccess(): number {
	consecutiveRateLimited = 0
	cooldownMs = Math.floor(cooldownMs / 2)
	return cooldownMs
}

/**
 * Current cooldown without registering anything. Loops sleep this between
 * items; zero means no rate-limit pressure observed.
 */
export function getCooldownMs(): number {
	return cooldownMs
}

/**
 * Number of consecutive rate-limited responses seen (diagnostics/tests).
 */
export function getConsecutiveRateLimited(): number {
	return consecutiveRateLimited
}

/**
 * Sleep the current cooldown, if any. Resolves immediately when there is no
 * pressure, so loops can call this unconditionally after each item.
 */
export async function sleepCooldown(): Promise<void> {
	if (cooldownMs <= 0) return
	await sleep(cooldownMs)
}

/** Test hook: zero all state. */
export function resetCooldown(): void {
	consecutiveRateLimited = 0
	cooldownMs = 0
	notify = null
}
