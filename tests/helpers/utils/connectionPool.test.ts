import pooledAxios, { closePool, getPoolConfig } from '#helpers/utils/connectionPool'

describe('Connection Pool', () => {
	const originalEnv = process.env

	beforeEach(() => {
		jest.resetModules()
		process.env = { ...originalEnv }
	})

	afterAll(() => {
		process.env = originalEnv
	})

	describe('pooledAxios instance', () => {
		it('should be an axios instance', () => {
			expect(pooledAxios).toBeDefined()
			expect(pooledAxios.get).toBeDefined()
			expect(pooledAxios.post).toBeDefined()
		})

		it('should have timeout configured', () => {
			expect(pooledAxios.defaults.timeout).toBe(30000)
		})

		it('should have validateStatus configured to only accept 200', () => {
			expect(pooledAxios.defaults.validateStatus).toBeDefined()
			expect(pooledAxios.defaults.validateStatus!(200)).toBe(true)
			expect(pooledAxios.defaults.validateStatus!(201)).toBe(false)
			expect(pooledAxios.defaults.validateStatus!(400)).toBe(false)
			expect(pooledAxios.defaults.validateStatus!(500)).toBe(false)
		})
	})

	describe('getPoolConfig', () => {
		it('should return configuration object', () => {
			const config = getPoolConfig()

			expect(config).toHaveProperty('maxSockets')
			expect(config).toHaveProperty('maxFreeSockets')
			expect(config).toHaveProperty('keepAlive')
			expect(config).toHaveProperty('timeout')
		})

		it('should respect HTTP_MAX_SOCKETS environment variable', async () => {
			process.env.HTTP_MAX_SOCKETS = '30'
			jest.resetModules()
			const { getPoolConfig: getConfigWithEnv } = await import('#helpers/utils/connectionPool')
			const config = getConfigWithEnv()

			expect(config.maxSockets).toBe(30)
		})

		it('should respect HTTP_TIMEOUT_MS environment variable', async () => {
			process.env.HTTP_TIMEOUT_MS = '60000'
			jest.resetModules()
			const { getPoolConfig: getConfigWithEnv } = await import('#helpers/utils/connectionPool')
			const config = getConfigWithEnv()

			expect(config.timeout).toBe(60000)
		})

		it('should enforce guardrail of max 50 sockets', async () => {
			process.env.HTTP_MAX_SOCKETS = '100'
			jest.resetModules()
			const { getPoolConfig: getConfigWithEnv } = await import('#helpers/utils/connectionPool')
			const config = getConfigWithEnv()

			expect(config.maxSockets).toBe(50)
		})

		it('should fallback to default when HTTP_MAX_SOCKETS is non-numeric', async () => {
			process.env.HTTP_MAX_SOCKETS = 'abc'
			jest.resetModules()
			const { getPoolConfig: getConfigWithEnv } = await import('#helpers/utils/connectionPool')
			const config = getConfigWithEnv()

			expect(config.maxSockets).toBe(50)
		})

		it('should fallback to default when HTTP_MAX_SOCKETS is negative', async () => {
			process.env.HTTP_MAX_SOCKETS = '-1'
			jest.resetModules()
			const { getPoolConfig: getConfigWithEnv } = await import('#helpers/utils/connectionPool')
			const config = getConfigWithEnv()

			expect(config.maxSockets).toBe(50)
		})

		it('should fallback to default when HTTP_MAX_SOCKETS is zero', async () => {
			process.env.HTTP_MAX_SOCKETS = '0'
			jest.resetModules()
			const { getPoolConfig: getConfigWithEnv } = await import('#helpers/utils/connectionPool')
			const config = getConfigWithEnv()

			expect(config.maxSockets).toBe(50)
		})

		it('should fallback to default when HTTP_TIMEOUT_MS is non-numeric', async () => {
			process.env.HTTP_TIMEOUT_MS = 'xyz'
			jest.resetModules()
			const { getPoolConfig: getConfigWithEnv } = await import('#helpers/utils/connectionPool')
			const config = getConfigWithEnv()

			expect(config.timeout).toBe(30000)
		})

		it('should fallback to default when HTTP_TIMEOUT_MS is negative', async () => {
			process.env.HTTP_TIMEOUT_MS = '-100'
			jest.resetModules()
			const { getPoolConfig: getConfigWithEnv } = await import('#helpers/utils/connectionPool')
			const config = getConfigWithEnv()

			expect(config.timeout).toBe(30000)
		})

		it('should fallback to default when HTTP_TIMEOUT_MS is zero', async () => {
			process.env.HTTP_TIMEOUT_MS = '0'
			jest.resetModules()
			const { getPoolConfig: getConfigWithEnv } = await import('#helpers/utils/connectionPool')
			const config = getConfigWithEnv()

			expect(config.timeout).toBe(30000)
		})
	})

	describe('closePool', () => {
		it('should close the pool and destroy agents', async () => {
			await closePool()
			// Agents are destroyed, calling closePool again should not throw
			await expect(closePool()).resolves.toBeUndefined()
		})
	})
})

describe('fetchPlus with connection pooling', () => {
	const originalEnv = process.env

	beforeEach(() => {
		jest.resetModules()
		process.env = { ...originalEnv }
	})

	afterAll(() => {
		process.env = originalEnv
	})

	it('should be defined', async () => {
		const { default: fetchPlus } = await import('#helpers/utils/fetchPlus')
		expect(fetchPlus).toBeDefined()
		expect(typeof fetchPlus).toBe('function')
	})

	it('should export fetchPlus with one required parameter', async () => {
		const { default: fetchPlus } = await import('#helpers/utils/fetchPlus')
		expect(fetchPlus.length).toBe(1)
		expect(typeof fetchPlus).toBe('function')
	})
})
