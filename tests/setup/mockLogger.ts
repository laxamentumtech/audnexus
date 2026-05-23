import { mock } from 'bun:test'

export const createMockLogger = () => ({
	error: mock(),
	info: mock(),
	warn: mock(),
	debug: mock(),
	fatal: mock(),
	trace: mock(),
	child: () => createMockLogger()
})
