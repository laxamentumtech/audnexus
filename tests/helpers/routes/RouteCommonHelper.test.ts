jest.mock('#helpers/utils/shared')
jest.mock('fastify')
import type { FastifyReply } from 'fastify'
import { DeepMockProxy, mockDeep } from 'jest-mock-extended'

import { ParsedQuerystring, RequestGeneric } from '#config/typing/requests'
import RouteCommonHelper from '#helpers/routes/RouteCommonHelper'

type MockContext = {
	client: DeepMockProxy<FastifyReply>
}

let asin: string
let ctx: MockContext
let helper: RouteCommonHelper
let query: RequestGeneric['Querystring']

const createMockContext = (): MockContext => {
	return {
		client: mockDeep<FastifyReply>()
	}
}

beforeEach(() => {
	asin = 'B079LRSMNN'
	ctx = createMockContext()
	query = { region: 'us' }
	helper = new RouteCommonHelper(asin, query, ctx.client)
	jest.spyOn(helper.sharedHelper, 'isValidAsin').mockReturnValue(true)
	jest.spyOn(helper.sharedHelper, 'isValidRegion').mockReturnValue(true)
})

describe('RouteCommonHelper should', () => {
	test('check if the asin is valid', () => {
		expect(helper.isValidAsin()).toBeTruthy()
	})
	test('check if the region is valid', () => {
		expect(helper.isValidRegion()).toBeTruthy()
	})
	test('return false if the region is not valid', () => {
		// Since the constructor adds region, we have to remove it
		helper = new RouteCommonHelper(asin, {}, ctx.client)
		helper.query = {} as ParsedQuerystring
		expect(helper.isValidRegion()).toBeFalsy()
	})
	test('run handler', () => {
		expect(helper.handler()).toEqual({ options: query, reply: ctx.client })
	})
	test('correctly vaildate the asin and region', () => {
		expect(helper.runValidations()).toBeUndefined()
	})
	test('parse options when no region', () => {
		const query = { name: 'Author Name', seedAuthors: '1', update: '1' }
		expect(helper.parseOptions(query)).toEqual({
			name: 'Author Name',
			region: 'us',
			seedAuthors: '1',
			update: '1'
		})
	})
})

describe('RouteCommonHelper should throw an error', () => {
	test('if the asin is not valid', () => {
		jest.spyOn(helper.sharedHelper, 'isValidAsin').mockReturnValue(false)
		expect(() => helper.runValidations()).toThrow()
		expect(helper.reply.code).toHaveBeenCalledWith(400)
	})
	test('if the region is not valid', () => {
		jest.spyOn(helper.sharedHelper, 'isValidRegion').mockReturnValue(false)
		expect(() => helper.runValidations()).toThrow()
		expect(helper.reply.code).toHaveBeenCalledWith(400)
	})
})
