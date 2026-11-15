// Resolve a transaction-capable MongoDB URI for the book history
// integration tests. Precedence:
//
// 1. `HISTORY_TEST_MONGODB_URI` — an explicit replica-set URI; used as-is
//    (verified to expose a `setName`).
// 2. Otherwise a long-lived single-node replica set is started in Docker on a
//    free port and its URI returned.
//
// If neither is available (env var points at a dead host, Docker absent,
// image cannot be pulled) `resolveHistoryMongo` returns null and the calling
// suite skips, so `bun run test` stays green on machines without Docker.
//
// The caller passes `stop()` back to `afterAll`; a started container is
// always torn down even on a failing run.

import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'

// Import the start/stop once, at module load; the resolver returns the exact
// container name the harness started, so teardown always targets that same
// invocation's container.
import { CONTAINER_PREFIX, startReplicaSet, stopReplicaSet } from './mongo-rs'

export interface HistoryMongo {
	uri: string
	stop: () => Promise<void>
}

/**
 * Resolve a replica set for one suite. Each invocation gets its own
 * container (unique `audnexus-history-rs-<suite>-<uuid>` name + free port)
 * because every suite drops the shared `audnexus` DB: a single shared
 * container + name means `bun test tests/integration` (both suites in one
 * process tree) would race on one data directory. A container left behind
 * by an interrupted run can therefore never block a later one. The
 * `test:history` script runs the suites in separate invocations. The
 * explicit-URI path shares one DB across suites; suites are run serially by
 * `test:history`, so no container is started.
 */
export async function resolveHistoryMongo(suite: string): Promise<HistoryMongo | null> {
	const explicit = process.env.HISTORY_TEST_MONGODB_URI
	if (explicit) {
		const probe = new MongoClient(explicit, { serverSelectionTimeoutMS: 5000 })
		try {
			await probe.connect()
			const hello = (await probe.db('admin').command({ hello: 1 })) as { setName?: string }
			if (!hello.setName) return null
			return { uri: explicit, stop: async () => {} }
		} catch {
			return null
		} finally {
			await probe.close()
		}
	}
	// Each invocation gets its own container (unique name + free port); the
	// suite label identifies runs in logs, never the container itself, so a
	// container left behind by an interrupted run can never block this one.
	try {
		const { uri, container } = await startReplicaSet({
			container: `${CONTAINER_PREFIX}-${suite}-${randomUUID()}`
		})
		return { uri, stop: async () => stopReplicaSet(container) }
	} catch {
		return null
	}
}
