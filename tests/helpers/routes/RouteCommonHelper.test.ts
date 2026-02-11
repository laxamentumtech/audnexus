jest.mock('#helpers/utils/shared')
jest.mock('fastify')
import type { FastifyReply } from 'fastify'
import { DeepMockProxy, mockDeep } from 'jest-mock-extended'

import { ApiQueryString, ApiQueryStringSchema } from '#config/types'
import RouteCommonHelper from '#helpers/routes/RouteCommonHelper'

type MockContext = {
	client: DeepMockProxy<FastifyReply>
}

let asin: string
let ctx: MockContext
let helper: RouteCommonHelper
let query: ApiQueryString

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
})

describe('RouteCommonHelper should', () => {
	test('run handler', () => {
		expect(helper.handler()).toEqual({ options: query, reply: ctx.client })
	})
	test('correctly vaildate the asin and region', () => {
		expect(helper.runValidations()).toBeUndefined()
	})
	test('correctly validate name and region', () => {
		helper = new RouteCommonHelper('', { name: 'test', region: 'us' }, ctx.client)
		expect(helper.runValidations()).toBeUndefined()
	})
	test('parse empty query', () => {
		helper = new RouteCommonHelper(asin, {}, ctx.client)
		expect(helper.handler().options).toEqual({ region: 'us' })
	})
	test('parse options when no region', () => {
		const query = { name: 'Author Name', seedAuthors: '1', update: '1' }
		expect(ApiQueryStringSchema.parse(query)).toEqual({
			name: 'Author Name',
			region: 'us',
			seedAuthors: '1',
			update: '1'
		})
	})
})

describe('RouteCommonHelper should throw an error', () => {
	test('if the asin is not valid', () => {
		helper = new RouteCommonHelper('12345678910', query, ctx.client)
		expect(() => helper.runValidations()).toThrow()
		expect(helper.reply.code).toHaveBeenCalledWith(400)
	})
	test('if the name is not valid', () => {
		helper = new RouteCommonHelper('', { name: '' }, ctx.client)
		expect(() => helper.runValidations()).toThrow()
		expect(helper.reply.code).toHaveBeenCalledWith(400)
	})
	test('if the region is not valid', () => {
		helper = new RouteCommonHelper('', { region: 'mx' }, ctx.client)
		expect(() => helper.runValidations()).toThrow()
		expect(helper.reply.code).toHaveBeenCalledWith(400)
	})
	test('if an invalid option is passed', () => {
		helper = new RouteCommonHelper('', { seedAuthors: '2' }, ctx.client)
		expect(() => helper.runValidations()).toThrow()
		expect(helper.reply.code).toHaveBeenCalledWith(400)
	})
})
