import {
	ErrorMessageContentTypeMismatch,
	ErrorMessageValidationFailed,
	MessageDeleted,
	MessageNoChapters,
	MessageNoSearchParams,
	MessageNotFoundInDb
} from '#static/messages'

const asin = 'B07JZ5ZQZQ'

describe('Message output should be', () => {
	test('MessageDeleted', () => {
		expect(MessageDeleted(asin)).toBe(`${asin} deleted`)
	})
	test('MessageNoChapters', () => {
		expect(MessageNoChapters(asin)).toBe(`${asin} has no chapters`)
	})
	test('MessageNoSearchParams', () => {
		expect(MessageNoSearchParams).toBe('Invalid search parameters')
	})
	test('MessageNotFoundInDb', () => {
		expect(MessageNotFoundInDb(asin)).toBe(`${asin} not found in the database`)
	})
})

describe('ErrorMessageContentTypeMismatch should', () => {
	test('return correct format with ASIN, actualType, and expectedType', () => {
		const actualType = 'podcast'
		const expectedType = 'book'
		expect(ErrorMessageContentTypeMismatch(asin, actualType, expectedType)).toBe(
			`Item is a ${actualType}, not a ${expectedType}. ASIN: ${asin}`
		)
	})
	test('work with different content types', () => {
		expect(ErrorMessageContentTypeMismatch('B017V4U2VQ', 'author', 'book')).toBe(
			'Item is a author, not a book. ASIN: B017V4U2VQ'
		)
	})
})

describe('ErrorMessageValidationFailed should', () => {
	test('return correct format with ASIN and reason', () => {
		const reason = 'Missing required field: title'
		expect(ErrorMessageValidationFailed(asin, reason)).toBe(
			`Validation failed for ASIN: ${asin}. ${reason}`
		)
	})
	test('work with different validation reasons', () => {
		expect(ErrorMessageValidationFailed('B017V4U2VQ', 'Invalid format')).toBe(
			'Validation failed for ASIN: B017V4U2VQ. Invalid format'
		)
	})
})
