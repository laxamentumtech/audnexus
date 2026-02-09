import type { Config } from '@jest/types'

const config: Config.InitialOptions = {
	moduleNameMapper: {
		'#helpers/(.*)': '<rootDir>/src/helpers/$1',
		'#config/(.*)': '<rootDir>/src/config/$1',
		'#static/(.*)': '<rootDir>/src/static/$1',
		'#tests/(.*)': '<rootDir>/tests/$1'
	},
	restoreMocks: true,
	clearMocks: true,
	resetMocks: true,
	roots: ['<rootDir>'],
	testMatch: ['**/tests/live/**/*.live.test.ts'],
	testTimeout: 30000,
	transform: {
		'^.+\\.(ts|tsx)$': [
			'ts-jest',
			{
				tsconfig: '<rootDir>/tests/tsconfig.json'
			}
		]
	},
	// Only run live tests when explicitly enabled
	testPathIgnorePatterns: process.env.RUN_LIVE_TESTS !== 'true' ? ['.*'] : [],
	passWithNoTests: true,
	verbose: true
}
export default config
