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
	transformIgnorePatterns: ['node_modules/(?!.*papr)']
}
export default config
