import typescriptEslint from '@typescript-eslint/eslint-plugin'
import jest from 'eslint-plugin-jest'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'
import tsParser from '@typescript-eslint/parser'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import { FlatCompat } from '@eslint/eslintrc'
import { includeIgnoreFile } from '@eslint/compat'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: js.configs.recommended,
	allConfig: js.configs.all
})
const gitignorePath = path.resolve(__dirname, '.gitignore')

export default [
	...compat.extends('eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'),
	includeIgnoreFile(gitignorePath),
	{
		ignores: ['dist/']
	},
	{
		plugins: {
			'@typescript-eslint': typescriptEslint,
			jest,
			'simple-import-sort': simpleImportSort
		},

		languageOptions: {
			globals: {
				...globals.node,
				...jest.environments.globals.globals
			},

			parser: tsParser,
			ecmaVersion: 2021,
			sourceType: 'module'
		}
	},
	{
		files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],

		rules: {
			'simple-import-sort/imports': [
				'error',
				{
					groups: [
						// Packages `react` related packages come first.
						['^react', '^@?\\w'],
						// Internal packages.
						['^(@|components)(/.*|$)'],
						// Side effect imports.
						['^\\u0000'],
						// Parent imports. Put `..` last.
						['^\\.\\.(?!/?$)', '^\\.\\./?$'],
						// Other relative imports. Put same-folder imports and `.` last.
						['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],
						// Style imports.
						['^.+\\.?(css)$']
					]
				}
			],
			'simple-import-sort/exports': 'error'
		}
	}
]
