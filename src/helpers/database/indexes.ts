import { BSON, type Db, type Document } from 'mongodb'

import { DATABASE_INDEXES, type ManagedIndex } from '#config/databaseIndexes'

export type IndexMode = 'auto' | 'verify'
export type IndexStatus =
	| 'present'
	| 'adopted'
	| 'created'
	| 'missing'
	| 'building'
	| 'conflict'
	| 'failed'
export interface IndexOutcome {
	id: string
	collection: string
	preferredName: string
	actualName?: string
	status: IndexStatus
	diffs: string[]
	elapsedMs: number
	mongoCode?: number
	message?: string
}
export interface IndexReport {
	outcomes: IndexOutcome[]
	extras: { collection: string; name: string; duplicateOf?: string }[]
}
export class IndexRequirementError extends Error {
	constructor(
		public readonly report: IndexReport,
		options?: ErrorOptions
	) {
		super(
			`Required database indexes are not ready: ${report.outcomes
				.filter((o) => !ready(o))
				.map(
					(o) =>
						`${o.collection}/${o.preferredName}: ${o.status} ${o.diffs.join(', ')} ${o.message ?? ''}`
				)
				.join('; ')}`,
			options
		)
		this.name = 'IndexRequirementError'
	}
}
const ready = (outcome: IndexOutcome) => ['present', 'adopted', 'created'].includes(outcome.status)
const code = (error: unknown): number | undefined => {
	if (error === null || typeof error !== 'object' || !('code' in error)) return undefined
	const value = error.code
	// Raw cursor commands preserve BSON numeric types in errors as well as
	// index metadata. Normalize only diagnostic codes, not compared values.
	if (typeof value === 'number') return Number.isSafeInteger(value) ? value : undefined
	if (value instanceof BSON.Int32 || value instanceof BSON.Double || value instanceof BSON.Long) {
		const numeric = Number(value)
		return Number.isSafeInteger(numeric) ? numeric : undefined
	}
	return undefined
}
const equal = (a: unknown, b: unknown): boolean => {
	const left = BSON.serialize({ value: a })
	const right = BSON.serialize({ value: b })
	return left.length === right.length && left.every((value, index) => value === right[index])
}
const plain = (v: unknown): v is Document =>
	v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype
const sorted = (doc: Document, transform: (key: string, value: unknown) => unknown): Document =>
	Object.fromEntries(
		Object.keys(doc)
			.sort()
			.map((key) => [key, transform(key, doc[key])])
	)

/** Sort only query-expression documents, never embedded equality values. */
function filterExpression(value: unknown): unknown {
	if (!plain(value)) return value
	return sorted(value, (key, child) => {
		if (['$and', '$or', '$nor'].includes(key) && Array.isArray(child))
			return child.map(filterExpression)
		if (key.startsWith('$')) return child
		if (plain(child) && Object.keys(child).every((k) => k.startsWith('$'))) {
			return sorted(child, (operator, operand) =>
				operator === '$elemMatch' ? filterExpression(operand) : operand
			)
		}
		return child
	})
}
function collation(value: Document | undefined): Document {
	if (!value || value.locale === 'simple') return { locale: 'simple' }
	return sorted(
		{
			locale: value.locale,
			caseLevel: false,
			caseFirst: 'off',
			strength: 3,
			numericOrdering: false,
			alternate: 'non-ignorable',
			maxVariable: 'punct',
			normalization: false,
			backwards: false,
			...Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'version'))
		},
		(_key, item) => item
	)
}
function keys(index: Document): unknown[] {
	const weights = index.weights as Document | undefined
	const result: unknown[] = []
	for (const [field, direction] of Object.entries(index.key as Document)) {
		if (field === '_fts' && direction === 'text') {
			for (const name of Object.keys(weights ?? {}).sort()) result.push([name, 'text'])
		} else if (field !== '_ftsx')
			result.push([field, typeof direction === 'string' ? direction : Number(direction)])
	}
	return result
}
function desiredKeys(def: ManagedIndex): unknown[] {
	// Text fields are represented as one internal segment; order among text
	// fields is immaterial, but compound prefix/suffix order is not.
	const result: unknown[] = []
	let addedText = false
	for (const [field, direction] of Object.entries(def.keys)) {
		if (direction === 'text') {
			if (!addedText)
				for (const name of Object.keys(def.keys)
					.filter((k) => def.keys[k] === 'text')
					.sort())
					result.push([name, 'text'])
			addedText = true
		} else result.push([field, direction])
	}
	return result
}
export function indexDifferences(
	def: ManagedIndex,
	actual: Document,
	collectionCollation?: Document
): string[] {
	const expected = def.options
	const diffs: string[] = []
	if (!equal(desiredKeys(def), keys(actual))) diffs.push('ordered keys')
	for (const option of ['unique', 'sparse', 'hidden'] as const) {
		const implicitUnique =
			option === 'unique' && Object.keys(def.keys).length === 1 && def.keys._id === 1
		if (
			(implicitUnique || (expected[option] ?? false)) !==
			(implicitUnique || (actual[option] ?? false))
		)
			diffs.push(option)
	}
	if (
		!equal(
			filterExpression(expected.partialFilterExpression ?? null),
			filterExpression(actual.partialFilterExpression ?? null)
		)
	)
		diffs.push('partialFilterExpression')
	if (!equal(collation(expected.collation ?? collectionCollation), collation(actual.collation)))
		diffs.push('collation')
	if (
		!equal(
			expected.expireAfterSeconds ?? null,
			actual.expireAfterSeconds == null ? null : Number(actual.expireAfterSeconds)
		)
	)
		diffs.push('expireAfterSeconds')
	if (Object.values(def.keys).includes('text')) {
		const weights =
			expected.weights ??
			Object.fromEntries(
				Object.entries(def.keys)
					.filter(([, v]) => v === 'text')
					.map(([k]) => [k, 1])
			)
		const actualWeights = Object.fromEntries(
			Object.entries(actual.weights ?? {}).map(([k, v]) => [k, Number(v)])
		)
		if (
			!equal(
				sorted(weights, (_k, v) => v),
				sorted(actualWeights, (_k, v) => v)
			)
		)
			diffs.push('weights')
		for (const [option, fallback] of [
			['default_language', 'english'],
			['language_override', 'language'],
			['textIndexVersion', 3]
		] as const) {
			const observed =
				option === 'textIndexVersion'
					? Number(actual[option] ?? fallback)
					: (actual[option] ?? fallback)
			if ((expected[option] ?? fallback) !== observed) diffs.push(option)
		}
	}
	return diffs
}
async function snapshot(
	db: Db,
	collection: string
): Promise<{ indexes: Document[]; collation?: Document }> {
	const metadata = await db.listCollections({ name: collection }, { nameOnly: false }).toArray()
	try {
		const indexes = await db
			.runCursorCommand(
				{ listIndexes: collection, includeBuildUUIDs: true },
				{ promoteValues: false }
			)
			.toArray()
		// MongoDB 7 wraps only in-progress indexes as { spec, buildUUID }
		// when includeBuildUUIDs is requested (list_indexes.cpp).
		return {
			indexes: indexes.map((index) =>
				index.spec ? { ...index.spec, buildUUID: index.buildUUID } : index
			),
			collation: metadata[0]?.options?.collation
		}
	} catch (error) {
		if (code(error) === 26) return { indexes: [] }
		throw error
	}
}
export function indexSettings(env: NodeJS.ProcessEnv = process.env): {
	mode: IndexMode
	buildWaitMs: number
} {
	const mode = env.DB_INDEX_MODE ?? 'auto'
	if (mode !== 'auto' && mode !== 'verify') throw new Error('DB_INDEX_MODE must be auto or verify')
	const raw = env.DB_INDEX_BUILD_WAIT_MS ?? '1800000'
	const buildWaitMs = Number(raw)
	if (!/^\d+$/.test(raw) || !Number.isSafeInteger(buildWaitMs) || buildWaitMs <= 0)
		throw new Error('DB_INDEX_BUILD_WAIT_MS must be a positive integer')
	return { mode, buildWaitMs }
}
export async function inspectIndexes(
	db: Db,
	selection: readonly ManagedIndex[] = DATABASE_INDEXES
): Promise<IndexReport> {
	const report: IndexReport = { outcomes: [], extras: [] }
	for (const collection of new Set(selection.map((def) => def.collection))) {
		const start = Date.now()
		const state = await snapshot(db, collection)
		const matched = new Set<string>()
		for (const def of selection.filter((item) => item.collection === collection)) {
			const named = state.indexes.find((index) => index.name === def.name)
			const equivalent = state.indexes.filter(
				(index) => indexDifferences(def, index, state.collation).length === 0
			)
			const actual = equivalent.find((index) => !index.buildUUID) ?? equivalent[0]
			const conflict =
				named && indexDifferences(def, named, state.collation).length > 0
					? named
					: !actual
						? state.indexes.find(
								(index) =>
									equal(desiredKeys(def), keys(index)) ||
									(Object.values(def.keys).includes('text') && index.weights)
							)
						: undefined
			const outcome: IndexOutcome = {
				id: def.id,
				collection,
				preferredName: def.name,
				status: 'missing',
				diffs: [],
				elapsedMs: Date.now() - start
			}
			if (conflict) {
				outcome.status = 'conflict'
				outcome.actualName = conflict.name
				outcome.diffs = indexDifferences(def, conflict, state.collation)
				outcome.message =
					'Explicit release-owned migration required; use a versioned name for ordinary nonunique access-path additions. No indexes were dropped.'
			} else if (actual) {
				outcome.actualName = actual.name
				outcome.status = actual.buildUUID
					? 'building'
					: actual.name === def.name
						? 'present'
						: 'adopted'
				matched.add(actual.name)
			}
			report.outcomes.push(outcome)
			for (const extra of equivalent.filter((index) => index !== actual))
				report.extras.push({ collection, name: extra.name, duplicateOf: def.id })
		}
		for (const index of state.indexes)
			if (
				index.name !== '_id_' &&
				!matched.has(index.name) &&
				!report.extras.some((extra) => extra.collection === collection && extra.name === index.name)
			)
				report.extras.push({ collection, name: index.name })
	}
	return report
}
export function assertRequiredIndexes(report: IndexReport): void {
	if (report.outcomes.some((outcome) => !ready(outcome))) throw new IndexRequirementError(report)
}
export async function reconcileIndexes(
	db: Db,
	options: {
		mode?: IndexMode
		buildWaitMs?: number
		selection?: readonly ManagedIndex[]
		emit?: (outcome: IndexOutcome) => void
	} = {}
): Promise<IndexReport> {
	const settings = indexSettings()
	const mode = options.mode ?? settings.mode
	const buildWaitMs = options.buildWaitMs ?? settings.buildWaitMs
	const selection = options.selection ?? DATABASE_INDEXES
	const completed: IndexOutcome[] = []
	for (const def of selection) {
		const start = Date.now()
		const deadline = start + buildWaitMs
		let created = false
		let raceError: unknown
		for (;;) {
			let report: IndexReport
			try {
				report = await inspectIndexes(db, [def])
			} catch (error) {
				const outcome: IndexOutcome = {
					id: def.id,
					collection: def.collection,
					preferredName: def.name,
					status: 'failed',
					diffs: [],
					elapsedMs: Date.now() - start,
					mongoCode: code(error),
					message: String(error)
				}
				options.emit?.(outcome)
				throw new IndexRequirementError(
					{ outcomes: [...completed, outcome], extras: [] },
					{ cause: error }
				)
			}
			const outcome = report.outcomes[0]
			outcome.elapsedMs = Date.now() - start
			if (ready(outcome)) {
				if (created) outcome.status = 'created'
				completed.push(outcome)
				options.emit?.(outcome)
				break
			}
			if (
				mode === 'verify' ||
				outcome.status === 'conflict' ||
				Date.now() >= deadline ||
				(raceError && outcome.status !== 'building')
			) {
				if (raceError) {
					outcome.mongoCode = code(raceError)
					outcome.message = `${outcome.message ?? ''} ${String(raceError)}`
				}
				if (outcome.status === 'building')
					outcome.message =
						'Index build is not committed; build wait deadline exceeded or verify mode is read-only'
				options.emit?.(outcome)
				throw new IndexRequirementError(
					{ outcomes: [...completed, outcome], extras: report.extras },
					{ cause: raceError }
				)
			}
			if (outcome.status === 'building') {
				options.emit?.(outcome)
				const { promise, resolve } = Promise.withResolvers<void>()
				setTimeout(resolve, Math.min(250, Math.max(1, deadline - Date.now())))
				await promise
				continue
			}
			try {
				await db.collection(def.collection).createIndex(def.keys, {
					...def.options,
					name: def.name,
					maxTimeMS: Math.max(1, deadline - Date.now())
				})
				created = true
			} catch (error) {
				// Only a semantically matching committed index or pending build
				// can resolve a race. Every other Mongo error retains its cause.
				if (![68, 85, 86, 285].includes(code(error) ?? -1)) {
					outcome.status = 'failed'
					outcome.mongoCode = code(error)
					outcome.message = String(error)
					options.emit?.(outcome)
					throw new IndexRequirementError(
						{ outcomes: [...completed, outcome], extras: report.extras },
						{ cause: error }
					)
				}
				raceError = error
			}
		}
	}
	const report = await inspectIndexes(db, selection)
	assertRequiredIndexes(report)
	return { ...report, outcomes: completed }
}
