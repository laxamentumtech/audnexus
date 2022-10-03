import {
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
