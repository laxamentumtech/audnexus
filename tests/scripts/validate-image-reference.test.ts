import { describe, expect, test } from 'bun:test'

import { immutableImageReferenceReason } from '../../scripts/validate-image-reference.ts'

const digest = `@sha256:${'a1b2c3d4e5'.repeat(7).slice(0, 64)}`
const fullDigest = `@sha256:8bb4442761a63a8dda452744082cdac9644b429807eb977b42324a63cef59ca4`

describe('immutableImageReferenceReason should', () => {
	test('accept version tags with or without a registry path', () => {
		expect(immutableImageReferenceReason('v1.15.0')).toBeNull()
		expect(immutableImageReferenceReason('v0.1.0')).toBeNull()
		expect(immutableImageReferenceReason('ghcr.io/laxamentumtech/audnexus:v1.15.2')).toBeNull()
		expect(immutableImageReferenceReason('localhost:5000/audnexus:v1.15.0')).toBeNull()
	})

	test('accept digest pins on full repository paths', () => {
		expect(immutableImageReferenceReason(`ghcr.io/laxamentumtech/audnexus${fullDigest}`)).toBeNull()
		expect(immutableImageReferenceReason(`registry.example.com:443/team/app${digest}`)).toBeNull()
	})

	test('reject unset and empty values', () => {
		expect(immutableImageReferenceReason(undefined)).toMatch(/unset or empty/)
		expect(immutableImageReferenceReason('')).toMatch(/empty/)
		expect(immutableImageReferenceReason('   ')).toMatch(/empty/)
	})

	test('reject :latest mutable aliases', () => {
		expect(immutableImageReferenceReason('ghcr.io/laxamentumtech/audnexus:latest')).toMatch(/:latest/)
		expect(immutableImageReferenceReason('nginx:latest')).toMatch(/:latest/)
	})

	test('reject untagged image references', () => {
		expect(immutableImageReferenceReason('ghcr.io/laxamentumtech/audnexus')).toMatch(/Untagged/)
		expect(immutableImageReferenceReason('nginx')).toMatch(/Untagged/)
	})

	test('reject non-version tags', () => {
		expect(immutableImageReferenceReason('ghcr.io/laxamentumtech/audnexus:main')).toMatch(/not an immutable version tag/)
		expect(immutableImageReferenceReason('audnexus:dev')).toMatch(/not an immutable version tag/)
	})

	test('reject malformed digests', () => {
		expect(immutableImageReferenceReason('ghcr.io/laxamentumtech/audnexus@sha256:abc')).toMatch(/Digest pins/)
		expect(immutableImageReferenceReason('ghcr.io/laxamentumtech/audnexus@md5:abc')).toMatch(/Digest pins/)
		expect(immutableImageReferenceReason(fullDigest)).toMatch(/Digest pins/)
	})

	test('reject digest pins without a repository path', () => {
		expect(immutableImageReferenceReason(`node:18-alpine${fullDigest}`)).toMatch(/full repository path/)
	})

	test('reject whitespace and control characters', () => {
		expect(immutableImageReferenceReason('v1.15.0 ')).toMatch(/whitespace/)
		expect(immutableImageReferenceReason('v1.15.0\r\n')).toMatch(/whitespace/)
		expect(immutableImageReferenceReason('v1;15.0')).toMatch(/non-reference/)
	})
})
