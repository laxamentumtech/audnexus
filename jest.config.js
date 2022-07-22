module.exports = {
    moduleNameMapper: {
        '#helpers/(.*)': '<rootDir>/src/helpers/$1',
        '#config/(.*)': '<rootDir>/src/config/$1',
        '#root/(.*)': '<rootDir>/src/$1'
    },
    roots: ['<rootDir>'],
    testMatch: ['tests/**/*.+(ts|tsx|js)', '**/?(*.)+(spec|test).+(ts|tsx|js)'],
    transform: {
        '^.+\\.(ts|tsx)$': 'ts-jest'
    }
}
