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

// Import the start/stop and the container-name constant once, at module load,
// so both the resolver and the teardown agree on the exact same name.
import { CONTAINER, startReplicaSet, stopReplicaSet } from './mongo-rs'

export interface HistoryMongo {
	uri: string
	stop: () => Promise<void>
}

export async function resolveHistoryMongo(): Promise<HistoryMongo | null> {
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
	try {
		const uri = await startReplicaSet({ container: CONTAINER })
		return { uri, stop: async () => stopReplicaSet(CONTAINER) }
	} catch {
		return null
	}
}
