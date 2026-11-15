// URL helpers for the product API response-group negotiation (tags fail-open).

/** Read the numeric HTTP status off a rejected fetch, if present. */
export function fetchStatus(error: unknown): number | undefined {
	if (typeof error !== 'object' || error === null) return undefined
	if ('status' in error && typeof error.status === 'number') return error.status
	if ('response' in error && typeof error.response === 'object' && error.response !== null) {
		const response = error.response
		if ('status' in response && typeof response.status === 'number') return response.status
	}
	return undefined
}

function readDataMessage(error: unknown): string | undefined {
	if (typeof error !== 'object' || error === null) return undefined
	if (!('data' in error) || typeof error.data !== 'object' || error.data === null) return undefined
	if (!('message' in error.data)) return undefined
	const message = error.data.message
	return typeof message === 'string' ? message : undefined
}

/**
 * True when the upstream 400 is Audible rejecting the `tags` response
 * group: status 400 with a message naming both the invalid-group refusal
 * and `tags`. Other 400s are fatal, not a group-rejection signal.
 */
export function isInvalidTagsGroupError(error: unknown): boolean {
	if (fetchStatus(error) !== 400) return false
	const message = readDataMessage(error)
	if (message === undefined) return false
	return message.includes('Invalid response group(s) requested') && message.includes('tags')
}

/**
 * Remove one exact group from a `response_groups` URL parameter.
 * Returns the original URL when the parameter or group is absent.
 */
export function withoutResponseGroup(url: string, group: string): string {
	const parsed = new URL(url)
	const raw = parsed.searchParams.get('response_groups')
	if (raw === null) return url
	const groups = raw
		.split(',')
		.map((g) => g.trim())
		.filter((g) => g.length > 0)
	if (!groups.includes(group)) return url
	const kept = groups.filter((g) => g !== group)
	parsed.searchParams.set('response_groups', kept.join(','))
	return parsed.toString()
}
