// DB-only index operations. `check` never imports Papr or prepares schemas.
import { MongoClient } from 'mongodb'
import { pathToFileURL } from 'node:url'

import {
	assertRequiredIndexes,
	IndexRequirementError,
	inspectIndexes
} from '#helpers/database/indexes'

export async function runIndexCommand(
	client: MongoClient,
	command: 'check' | 'apply'
): Promise<void> {
	if (command === 'check') {
		const report = await inspectIndexes(client.db('audnexus'))
		console.log(JSON.stringify(report))
		assertRequiredIndexes(report)
		return
	}
	// A static import registers Papr models even for the read-only check path.
	const { initialize } = await import('#config/papr')
	await initialize({ client } as never, 'auto')
	console.log(JSON.stringify(await inspectIndexes(client.db('audnexus'))))
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	let client: MongoClient | undefined
	try {
		const command = process.argv[2]
		if (command !== 'check' && command !== 'apply') throw new Error('Usage: indexes check|apply')
		if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required')
		client = await MongoClient.connect(process.env.MONGODB_URI)
		await runIndexCommand(client, command)
	} catch (error) {
		console.error(
			JSON.stringify(
				error instanceof IndexRequirementError ? error.report : { error: String(error) }
			)
		)
		process.exitCode = 1
	} finally {
		await client?.close()
	}
}
