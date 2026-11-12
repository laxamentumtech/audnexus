import type { CollationOptions, Document } from 'mongodb'

/** Only options whose semantics the reconciler compares are supported. */
export interface ManagedIndexOptions {
	unique?: boolean
	sparse?: boolean
	partialFilterExpression?: Document
	collation?: CollationOptions
	hidden?: boolean
	expireAfterSeconds?: number
	weights?: Record<string, number>
	default_language?: string
	language_override?: string
	textIndexVersion?: number
}

export interface ManagedIndex {
	id: string
	collection: string
	name: string
	keys: Record<string, 1 | -1 | 'text'>
	options: ManagedIndexOptions
	requiredBy: readonly ('lookup' | 'search' | 'walk' | 'history')[]
}

/** Physical names are rollout contracts: retain legacy history names forever
 * until an explicit retirement migration. New ordinary access paths use a
 * new versioned name, never an in-place rewrite or automatic drop. */
export const DATABASE_INDEXES: readonly ManagedIndex[] = [
	{
		id: 'books.lookup',
		collection: 'books',
		name: 'history_book_lookup',
		keys: { asin: 1, region: 1 },
		options: {},
		requiredBy: ['lookup', 'history']
	},
	{
		id: 'authors.lookup',
		collection: 'authors',
		name: 'asin_1_region_1',
		keys: { asin: 1, region: 1 },
		options: {},
		requiredBy: ['lookup']
	},
	{
		id: 'chapters.lookup',
		collection: 'chapters',
		name: 'asin_1_region_1',
		keys: { asin: 1, region: 1 },
		options: {},
		requiredBy: ['lookup']
	},
	{
		id: 'authors.search',
		collection: 'authors',
		name: 'name_text',
		keys: { name: 'text' },
		options: {},
		requiredBy: ['search']
	},
	...['authors', 'books', 'chapters'].map(
		(collection): ManagedIndex => ({
			id: `${collection}.walk`,
			collection,
			name: 'updatedAt_1__id_1',
			keys: { updatedAt: 1, _id: 1 },
			options: {},
			requiredBy: ['walk']
		})
	),
	{
		id: 'history.revision',
		collection: 'book_history_revisions',
		name: 'history_revision',
		keys: { asin: 1, region: 1, revision: 1 },
		options: { unique: true },
		requiredBy: ['history']
	},
	{
		id: 'history.field',
		collection: 'book_history_revisions',
		name: 'history_field',
		keys: { asin: 1, region: 1, changedFields: 1, revision: -1 },
		options: {},
		requiredBy: ['history']
	},
	{
		id: 'history.image',
		collection: 'book_artwork',
		name: 'artwork_image',
		keys: { asin: 1, region: 1, imageId: 1 },
		options: { unique: true, partialFilterExpression: { imageId: { $type: 'string' } } },
		requiredBy: ['history']
	},
	{
		id: 'history.unparsed',
		collection: 'book_artwork',
		name: 'artwork_unparsed',
		keys: { asin: 1, region: 1, unparsedKey: 1 },
		options: { unique: true, partialFilterExpression: { unparsedKey: { $type: 'string' } } },
		requiredBy: ['history']
	},
	{
		id: 'history.order',
		collection: 'book_artwork',
		name: 'artwork_order',
		keys: { asin: 1, region: 1, sequence: 1 },
		options: { unique: true },
		requiredBy: ['history']
	}
]
