import type { Config } from '@jest/types'

const config: Config.InitialOptions = {
	globals: {
		'ts-jest': {
			tsconfig: '<rootDir>/tests/tsconfig.json'
		}
	},
	moduleNameMapper: {
		'#helpers/(.*)': '<rootDir>/src/helpers/$1',
		'#config/(.*)': '<rootDir>/src/config/$1',
		'#tests/(.*)': '<rootDir>/tests/$1'
	},
	restoreMocks: true,
	clearMocks: true,
	resetMocks: true,
	roots: ['<rootDir>'],
	testMatch: ['tests/**/*.+(ts|tsx|js)', '**/?(*.)+(spec|test).+(ts|tsx|js)'],
	transform: {
		'^.+\\.(ts|tsx)$': 'ts-jest'
	}
}
export default config
