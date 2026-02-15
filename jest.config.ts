import type { Config } from '@jest/types'

const config: Config.InitialOptions = {
	moduleNameMapper: {
		'#helpers/(.*)': '<rootDir>/src/helpers/$1',
		'#config/(.*)': '<rootDir>/src/config/$1',
		'#static/(.*)': '<rootDir>/src/static/$1',
		'#tests/(.*)': '<rootDir>/tests/$1',
		'^papr$': '<rootDir>/tests/mocks/papr.js',
		'^#helpers/utils/batchProcessor$': '<rootDir>/tests/__mocks__/batchProcessor.ts',
		'^p-limit$': '<rootDir>/tests/__mocks__/p-limit.js'
	},
	restoreMocks: true,
	clearMocks: true,
	resetMocks: true,
	coverageThreshold: {
		global: {
			branches: 80,
			functions: 85,
			lines: 85,
			statements: 85
		}
	},
	roots: ['<rootDir>'],
	testMatch: ['tests/**/*.+(ts|tsx|js)', '**/?(*.)+(spec|test).+(ts|tsx|js)'],
	testPathIgnorePatterns: ['tests/live/'],
	transform: {
		'^.+\\.(ts|tsx)$': [
			'ts-jest',
			{
				tsconfig: '<rootDir>/tests/tsconfig.json'
			}
		],
		'^.+\\.js$': 'babel-jest'
	},
	// Papr 17.x is now ES modules, needs to be transformed
	// Handle pnpm's nested structure: node_modules/.pnpm/papr@version/node_modules/papr/
	// p-limit is also ESM and needs transformation
	transformIgnorePatterns: ['node_modules/.pnpm/(?!(papr|p-limit)@)']
}
export default config
