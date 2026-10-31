import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sha = '0123456789abcdef0123456789abcdef01234567'
const otherSha = 'fedcba9876543210fedcba9876543210fedcba98'

const fixture = `openapi: 3.0.0
info:
  title: Audnexus
  description: Aggegate audiobook data
  version: 0.0.0
paths:
  /books/{asin}:
    get:
      summary: Book
      responses:
        '200':
          description: OK
`

interface StampResult {
	code: number
	stdout: string
	stderr: string
}

async function stampFixture(path: string, env: Record<string, string>): Promise<StampResult> {
	const child = Bun.spawn(
		['bun', 'scripts/stamp-docs-version.ts', path],
		{ cwd: process.cwd(), env: { ...process.env, ...env }, stdout: 'pipe', stderr: 'pipe' },
	)
	const stdout = new Response(child.stdout).text()
	const stderr = new Response(child.stderr).text()
	const code = await child.exited
	return { code, stdout: (await stdout).trim(), stderr: (await stderr).trim() }
}

async function readStampedVersion(path: string): Promise<unknown> {
	const spec = Bun.YAML.parse(await Bun.file(path).text()) as { info?: { version?: string } }
	return spec.info?.version
}

let root: string
let count = 0

beforeEach(async () => {
	count += 1
	root = join(tmpdir(), `audnexus-stamp-docs-${process.pid}-${Date.now()}-${count}`)
	await mkdir(root, { recursive: true })
	await writeFile(join(root, 'spec.yaml'), fixture)
})

afterEach(async () => {
	await rm(root, { recursive: true, force: true })
})

describe('scripts/stamp-docs-version.ts should', () => {
	test('stamp the release version from a release tag', async () => {
		const path = join(root, 'spec.yaml')
		const result = await stampFixture(path, {
			DOCS_REF: 'refs/tags/v1.2.0',
			DOCS_SOURCE: sha,
		})
		expect(result.code).toBe(0)
		expect(result.stdout).toBe(`Docs version: 1.2.0; source: ${sha}`)
		expect(await readStampedVersion(path)).toBe('1.2.0')
	})

	test('stamp the release version on an explicit release dispatch', async () => {
		const path = join(root, 'spec.yaml')
		const result = await stampFixture(path, {
			DOCS_REF: 'refs/tags/v1.2.0',
			DOCS_SOURCE: sha,
			DOCS_VERSION: 'v1.2.0',
		})
		expect(result.code).toBe(0)
		expect(await readStampedVersion(path)).toBe('1.2.0')
	})

	test('fall back to a dev-<sha> label on main', async () => {
		const path = join(root, 'spec.yaml')
		const result = await stampFixture(path, {
			DOCS_REF: 'refs/heads/main',
			DOCS_SOURCE: sha,
		})
		expect(result.code).toBe(0)
		expect(result.stdout).toBe(`Docs version: dev-${sha.slice(0, 12)}; source: ${sha}`)
		expect(await readStampedVersion(path)).toBe(`dev-${sha.slice(0, 12)}`)
	})

	test('fall back to a dev-<sha> label on develop', async () => {
		const path = join(root, 'spec.yaml')
		const result = await stampFixture(path, {
			DOCS_REF: 'refs/heads/develop',
			DOCS_SOURCE: sha,
		})
		expect(result.code).toBe(0)
		expect(await readStampedVersion(path)).toBe(`dev-${sha.slice(0, 12)}`)
	})

	test('reject an invalid docs source SHA', async () => {
		const path = join(root, 'spec.yaml')
		const result = await stampFixture(path, {
			DOCS_REF: 'refs/heads/main',
			DOCS_SOURCE: 'not-a-sha',
		})
		expect(result.code).toBe(1)
		expect(result.stderr).toContain('must be an exact commit SHA')
		expect(await readStampedVersion(path)).toBe('0.0.0')
	})

	test('reject a dispatch whose source differs from the reserved release source', async () => {
		const path = join(root, 'spec.yaml')
		const result = await stampFixture(path, {
			DOCS_REF: 'refs/tags/v1.2.0',
			DOCS_SOURCE: sha,
			DOCS_EXPECTED_SOURCE: otherSha,
		})
		expect(result.code).toBe(1)
		expect(result.stderr).toContain('does not match the reserved release source')
		expect(await readStampedVersion(path)).toBe('0.0.0')
	})

	test('reject an explicit version that does not match the immutable release tag', async () => {
		const path = join(root, 'spec.yaml')
		const result = await stampFixture(path, {
			DOCS_REF: 'refs/heads/main',
			DOCS_SOURCE: sha,
			DOCS_VERSION: 'v1.2.0',
		})
		expect(result.code).toBe(1)
		expect(result.stderr).toContain('matching immutable release tag')
		expect(await readStampedVersion(path)).toBe('0.0.0')
	})
})
