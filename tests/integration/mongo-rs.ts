// Single-node transaction-capable MongoDB replica set for the book history
// integration tests. Started via `docker` on a free port; the node joins as
// a 1-member replica set so `session.withTransaction` works (a standalone
// server cannot run multi-document transactions).
//
// `startReplicaSet` never leaks the container: on any failure (or when the
// primary never elected) it removes the container before rethrowing.

import { MongoClient } from 'mongodb'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const IMAGE = 'mongo:7.0.45'
export const CONTAINER = 'audnexus-history-rs'
const RS_NAME = 'rs0'
const PRIMARY_TIMEOUT_MS = 30_000

/** Resolve a free host port. */
function freePort(): Promise<number> {
	const { promise, resolve, reject } = Promise.withResolvers<number>()
	const srv = createServer()
	srv.unref()
	srv.on('error', reject)
	srv.listen({ host: '127.0.0.1', port: 0 }, () => {
		const { port } = srv.address() as { port: number }
		srv.close(() => resolve(port))
	})
	return promise
}

function docker(args: string[]): Promise<string> {
	const { promise, resolve, reject } = Promise.withResolvers<string>()
	const pieces: string[] = []
	const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] })
	child.stdout.on('data', (d) => pieces.push(String(d)))
	child.stderr.on('data', (d) => pieces.push(String(d)))
	child.on('close', (code) =>
		code === 0
			? resolve(pieces.join(''))
			: reject(new Error(`docker ${args.join(' ')} exited ${code}: ${pieces.join('').trim()}`))
	)
	return promise
}

/**
 * Start a single-node replica set in Docker and wait until it elects a
 * primary. Returns the transaction-capable connection URI.
 */
export async function startReplicaSet(options: {
	container?: string
	image?: string
	port?: number
} = {}): Promise<string> {
	const container = options.container ?? CONTAINER
	const image = options.image ?? IMAGE
	const port = options.port ?? (await freePort())
	// directConnection=true in the URI so every client (harness and test
	// suites) ignores the hello `hosts` hint, which points at the
	// container-internal hostname unreachable from the host.
	const uri = `mongodb://127.0.0.1:${port}?directConnection=true&replicaSet=${RS_NAME}`

	try {
		await docker(['rm', '-f', container]).catch(() => {})
		await docker([
			'run',
			'-d',
			'--name',
			container,
			'-p',
			`127.0.0.1:${port}:27017`,
			image,
			'--replSet',
			RS_NAME
		])

		const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 })
		const deadline = Date.now() + PRIMARY_TIMEOUT_MS
		let initiated = false
		try {
			while (Date.now() < deadline) {
				try {
					await client.connect()
				} catch {
					await new Promise((r) => setTimeout(r, 500))
					continue
				}
				if (!initiated) {
					// Initiate the 1-member set; already-initialized sets
					// return an error we ignore.
					try {
						await client.db('admin').command({
							replSetInitiate: {
								_id: RS_NAME,
								members: [{ _id: 0, host: 'localhost:27017' }]
							}
						})
					} catch {
						// Already initialized.
					}
					initiated = true
				}
				try {
					const hello = (await client.db('admin').command({ hello: 1 })) as {
						setName?: string
						isWritablePrimary?: boolean
					}
					if (hello.setName === RS_NAME && hello.isWritablePrimary) return uri
				} catch {
					// Server not answering yet.
				}
				await new Promise((r) => setTimeout(r, 500))
			}
			throw new Error('timed out waiting for the replica set primary')
		} finally {
			await client.close().catch(() => {})
		}
	} catch (error) {
		await docker(['rm', '-f', container]).catch(() => {})
		throw error
	}
}

/** Stop and remove the container (idempotent). */
export async function stopReplicaSet(container: string = CONTAINER): Promise<void> {
	await docker(['rm', '-f', container]).catch(() => {})
}
