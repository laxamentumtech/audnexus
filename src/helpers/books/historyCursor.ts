// Opaque keyset continuation cursors for the read-only history and artwork
// routes. A cursor is base64url(canonical JSON payload) with version 1; it
// is opaque continuation data — not authorization, and it requires no
// secret. The payload binds the cursor to its exact asin, region, list
// kind, and field filter, so reuse in any other context is rejected.
//
// `upper` is the initial state revision/assetSequence upper bound (0 for a
// pending resource) captured when the listing started; pages query
// `<= upper AND < before` in descending order, and the cursor retains that
// upper bound across pages. Strict validation (canonical encoding, safe
// integers, maximum input length) runs before any database lookup.

/** Hard limit for public cursor input length. */
export const HISTORY_CURSOR_MAX_LENGTH = 2048

export interface HistoryCursorPayload {
	v: 1
	kind: 'history'
	asin: string
	region: string
	field: string | null
	upper: number
	before: number
}

export interface ArtworkCursorPayload {
	v: 1
	kind: 'artwork'
	asin: string
	region: string
	upper: number
	before: number
}

const BASE64URL_ALPHABET = /^[A-Za-z0-9_-]+$/
// Payload strings stay printable and separator-free so the base64url
// round-trip is unambiguous.
const IDENTITY_VALUE = /^[A-Za-z0-9_-]+$/

/** Canonical JSON: recursively sorted object keys, no whitespace. */
export function canonicalJson(value: unknown): string {
	if (value === null || typeof value === 'number' || typeof value === 'boolean') {
		return JSON.stringify(value)
	}
	if (typeof value === 'string') return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`
	if (typeof value === 'object') {
		return (
			'{' +
			Object.keys(value as Record<string, unknown>)
				.sort()
				.map(
					(key) =>
						`${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
				)
				.join(',') +
			'}'
		)
	}
	throw new Error('Invalid cursor value')
}

export interface DecodedHistoryCursor {
	upper: number
	before: number
}

function isSafeCount(value: unknown, positive: boolean): value is number {
	return (
		typeof value === 'number' &&
		Number.isSafeInteger(value) &&
		(value < 0 ? false : positive ? value > 0 : true)
	)
}

function validateInput(cursor: string): string {
	if (cursor.length > HISTORY_CURSOR_MAX_LENGTH) throw new Error('Invalid cursor')
	if (!BASE64URL_ALPHABET.test(cursor)) throw new Error('Invalid cursor')
	const raw = Buffer.from(cursor, 'base64url').toString('utf8')
	// eslint-disable-next-line no-control-regex -- validating JSON text for control characters
	const invalidCharacter = /[\u0000-\u001f\u007f]/.test(raw)
	if (invalidCharacter || Buffer.from(raw, 'utf8').toString('base64url') !== cursor) {
		throw new Error('Invalid cursor')
	}
	return raw
}

function strictRecord(raw: string): Record<string, unknown> {
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch (error) {
		// Map any parse failure to the stable cursor error contract.
		throw new Error('Invalid cursor', { cause: error })
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('Invalid cursor')
	}
	if (canonicalJson(parsed) !== raw) throw new Error('Invalid cursor')
	return parsed as Record<string, unknown>
}

/**
 * Encode a history listing cursor. `before` is the last revision consumed
 * by the page just returned (exclusive next bound); `upper` is the
 * listing's initial upper bound, retained across pages.
 */
export function encodeCursor(
	asin: string,
	region: string,
	field: string | null,
	upper: number,
	before: number
): string {
	if (!IDENTITY_VALUE.test(asin) || !IDENTITY_VALUE.test(region)) throw new Error('Invalid cursor')
	if (field !== null && !IDENTITY_VALUE.test(field)) throw new Error('Invalid cursor')
	if (!isSafeCount(upper, false) || !isSafeCount(before, true))
		throw new Error('Invalid cursor value')
	const payload: HistoryCursorPayload = {
		v: 1,
		kind: 'history',
		asin,
		region,
		field,
		upper,
		before
	}
	const encoded = Buffer.from(canonicalJson(payload), 'utf8').toString('base64url')
	if (encoded.length > HISTORY_CURSOR_MAX_LENGTH) throw new Error('Invalid cursor value')
	return encoded
}

/**
 * Encode an artwork listing cursor. `before` is the last immutable asset
 * sequence consumed by the page just returned.
 */
export function encodeArtworkCursor(
	asin: string,
	region: string,
	upper: number,
	before: number
): string {
	if (!IDENTITY_VALUE.test(asin) || !IDENTITY_VALUE.test(region)) throw new Error('Invalid cursor')
	if (!isSafeCount(upper, false) || !isSafeCount(before, true))
		throw new Error('Invalid cursor value')
	const payload: ArtworkCursorPayload = { v: 1, kind: 'artwork', asin, region, upper, before }
	const encoded = Buffer.from(canonicalJson(payload), 'utf8').toString('base64url')
	if (encoded.length > HISTORY_CURSOR_MAX_LENGTH) throw new Error('Invalid cursor value')
	return encoded
}

/**
 * Decode and verify a history cursor for the exact asin+region+field
 * listing. `field` is the requested filter; `null` means unfiltered.
 * Returns null when no cursor was supplied. Throws a plain Error for any
 * malformed, non-canonical, oversized, or unbound cursor.
 */
export function decodeCursor(
	cursor: string | undefined,
	asin: string,
	region: string,
	field: string | null
): DecodedHistoryCursor | null {
	if (cursor === undefined) return null
	const payload = strictRecord(validateInput(cursor))
	if (payload.v !== 1) throw new Error('Invalid cursor')
	if (payload.kind !== 'history') throw new Error('Invalid cursor')
	if (payload.asin !== asin) throw new Error('Cursor does not match book')
	if (payload.region !== region) throw new Error('Cursor does not match book')
	if (payload.field !== field) throw new Error('Cursor does not match filter')
	if (!isSafeCount(payload.upper, false) || !isSafeCount(payload.before, true)) {
		throw new Error('Invalid cursor')
	}
	return { upper: payload.upper, before: payload.before }
}

/**
 * Decode and verify an artwork cursor for the exact asin+region listing.
 * Returns null when no cursor was supplied.
 */
export function decodeArtworkCursor(
	cursor: string | undefined,
	asin: string,
	region: string
): DecodedHistoryCursor | null {
	if (cursor === undefined) return null
	const payload = strictRecord(validateInput(cursor))
	if (payload.v !== 1) throw new Error('Invalid cursor')
	if (payload.kind !== 'artwork') throw new Error('Invalid cursor')
	if (payload.asin !== asin) throw new Error('Cursor does not match book')
	if (payload.region !== region) throw new Error('Cursor does not match book')
	if (!isSafeCount(payload.upper, false) || !isSafeCount(payload.before, true)) {
		throw new Error('Invalid cursor')
	}
	return { upper: payload.upper, before: payload.before }
}
