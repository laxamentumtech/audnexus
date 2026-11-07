import { describe, expect, it } from 'bun:test'

import { NotFoundError } from '#helpers/errors/ApiErrors'
import {
	isUpstreamGoneRedirect,
	UPSTREAM_GONE_REDIRECT_MARKER,
	UpstreamGoneError
} from '#helpers/utils/upstreamGone'

describe('isUpstreamGoneRedirect', () => {
	it('is true for the Audible search-page redirect', () => {
		expect(isUpstreamGoneRedirect('https://www.audible.com/search?advsearchKeywords=')).toBe(true)
		expect(isUpstreamGoneRedirect('https://www.audible.de/search?advsearchKeywords=')).toBe(true)
	})

	it('is false for non-redirect values', () => {
		expect(isUpstreamGoneRedirect(undefined)).toBe(false)
		expect(isUpstreamGoneRedirect('')).toBe(false)
		expect(isUpstreamGoneRedirect('https://www.audible.com/author/Laurence-Yep/B000APLCB6')).toBe(
			false
		)
		expect(isUpstreamGoneRedirect('https://api.audible.com/1.0/catalog/products/B00EA8E7I4')).toBe(
			false
		)
	})
})

describe('UpstreamGoneError', () => {
	it('subclasses NotFoundError with the UPSTREAM_GONE code', () => {
		const error = new UpstreamGoneError('https://www.audible.com/search?advsearchKeywords=')
		expect(error).toBeInstanceOf(UpstreamGoneError)
		expect(error).toBeInstanceOf(NotFoundError)
		expect(error.statusCode).toBe(404)
		expect(error.details).toEqual({ code: 'UPSTREAM_GONE' })
		expect(error.message).toContain('Upstream page gone (redirected to search)')
		expect(error.message).toContain(UPSTREAM_GONE_REDIRECT_MARKER)
		expect(error.name).toBe('UpstreamGoneError')
	})
})
