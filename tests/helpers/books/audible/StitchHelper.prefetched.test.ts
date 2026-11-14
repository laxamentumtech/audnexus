import { beforeEach, describe, expect, mock, test } from 'bun:test'

import { setPerformanceConfig } from '#config/performance'
import { AudibleProduct } from '#config/types'
import StitchHelper from '#helpers/books/audible/StitchHelper'
import * as fetchPlus from '#helpers/utils/fetchPlus'
import { apiResponse } from '#tests/datasets/helpers/books'
import { createTestPerformanceConfig } from '#tests/setup/performanceConfig'

mock.module('#helpers/utils/fetchPlus', () => {
	return { default: mock() }
})

mock.module('#helpers/utils/shared', () => {
	return {
		default: class SharedHelper {
			buildUrl() {
				return ''
			}
			getParamString() {
				return ''
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			sortObjectByKeys(obj: any) {
				return obj
			}
		}
	}
})

interface MockFetch {
	(url: string): Promise<unknown>
	mockReset(): void
	mock: { calls: unknown[][] }
}

const mockFetch = fetchPlus.default as unknown as MockFetch
const deepCopy = <T>(obj: T): T => JSON.parse(JSON.stringify(obj)) as T

beforeEach(() => {
	mockFetch.mockReset()
	setPerformanceConfig(createTestPerformanceConfig())
})

describe('StitchHelper prefetched product', () => {
	test('parses without a per-book API request', async () => {
		const receivedAt = new Date('2026-11-14T12:00:00Z')
		const helper = new StitchHelper('B079LRSMNN', 'us', undefined, true, {
			product: deepCopy((apiResponse as AudibleProduct).product),
			responseGroups: ['rating', 'product_desc'],
			receivedAt
		})

		const book = await helper.process()

		expect(book.asin).toBe('B079LRSMNN')
		expect(mockFetch.mock.calls).toHaveLength(0)
		const observation = helper.getHistoryObservation()
		expect(observation).toBeDefined()
		expect(observation?.apiReceivedAt).toEqual(receivedAt)
	})
})
