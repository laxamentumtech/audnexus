import { mock } from 'bun:test'
import type { FastifyBaseLogger } from 'fastify'

export const createMockLogger = (): FastifyBaseLogger => ({
	level: 'info',
	error: mock(),
	info: mock(),
	warn: mock(),
	debug: mock(),
	fatal: mock(),
	trace: mock(),
	silent: mock(),
	child: () => createMockLogger()
})
