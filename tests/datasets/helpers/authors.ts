import { ObjectId, WithId } from 'mongodb'

import { AuthorDocument } from '#config/models/Author'
import type { ApiAuthorProfile } from '#config/types'

const _id = new ObjectId('5c8f8f8f8f8f8f8f8f8f8f8f')
const asin = 'B012DQ3BCM'
const description =
	"JASON ANSPACH (1979- ) is the award-winning, Associated Press Best-selling author of Galaxy's Edge, Wayward Galaxy, and Forgotten Ruin. He is an American author raised in a military family (Go Army!) known for pulse-pounding military science fiction and adventurous space operas that deftly blend action, suspense, and comedy. Together with his wife, their seven (not a typo) children, and a border collie named Charlotte, Jason resides in Puyallup, Washington. He remains undefeated at arm wrestling against his entire family. Galaxy's Edge: www.InTheLegion.com Author website: www.JasonAnspach.com facebook.com/authorjasonanspach twitter.com/TheJasonAnspach"
export const genres = [
	{
		asin: '18580606011',
		name: 'Science Fiction & Fantasy',
		type: 'genre'
	},
	{
		asin: '18574426011',
		name: 'Literature & Fiction',
		type: 'genre'
	}
]
const image =
	'https://images-na.ssl-images-amazon.com/images/S/amzn-author-media-prod/a23ovhiu2v617aakia17mn7btk.jpg'
const name = 'Jason Anspach'
const region = 'us'
const similar = [
	{
		asin: 'B000APARWG',
		name: 'Blaine Lee Pardoe'
	},
	{
		asin: 'B08YC2Y6MV',
		name: 'Doc Spears'
	},
	{
		asin: 'B00W2ZAK7E',
		name: 'JN Chaney'
	},
	{
		asin: 'B007E4W0GC',
		name: 'Jonathan P. Brazee'
	},
	{
		asin: 'B001IGQXEW',
		name: 'Karen Traviss'
	},
	{
		asin: 'B00A8JBYDU',
		name: 'Peter Nealen'
	},
	{
		asin: 'B00B1GNL4E',
		name: 'Rick Partlow'
	},
	{
		asin: 'B005LW1K1A',
		name: 'William S Frisbee Jr'
	}
]
export const similarUnsorted = [
	{
		asin: 'B00A8JBYDU',
		name: 'Peter Nealen'
	},
	{
		asin: 'B00W2ZAK7E',
		name: 'JN Chaney'
	},
	{
		asin: 'B00B1GNL4E',
		name: 'Rick Partlow'
	},
	{
		asin: 'B001IGQXEW',
		name: 'Karen Traviss'
	},
	{
		asin: 'B007E4W0GC',
		name: 'Jonathan P. Brazee'
	},
	{
		asin: 'B000APARWG',
		name: 'Blaine Lee Pardoe'
	},
	{
		asin: 'B005LW1K1A',
		name: 'William S Frisbee Jr'
	},
	{
		asin: 'B08YC2Y6MV',
		name: 'Doc Spears'
	}
]

export const cleanupDescription = `JASON ANSPACH (1979- ) is the award-winning, Associated Press Best-selling author of Galaxy's Edge, Wayward Galaxy, and Forgotten Ruin. He is an American author raised in a military family (Go Army!) known for pulse-pounding military science fiction and adventurous space operas that deftly blend action, suspense, and comedy. Together with his wife, their seven (not a typo) children, and a border collie named Charlotte, Jason resides in Puyallup, Washington. He remains undefeated at arm wrestling against his entire family. Galaxy's Edge:  Author website:`

export const parsedAuthor: ApiAuthorProfile = {
	asin,
	description,
	genres,
	image,
	name,
	region,
	similar
}

const authorWithIdInternal: WithId<ApiAuthorProfile> = {
	_id,
	...parsedAuthor
}

export const authorWithId = (): WithId<ApiAuthorProfile> => {
	return {
		_id,
		...parsedAuthor
	}
}

export const authorWithoutProjection: AuthorDocument = {
	...authorWithIdInternal,
	createdAt: new Date('2019-03-18T00:00:00.000Z'),
	updatedAt: new Date('2019-03-18T00:00:00.000Z')
}

export const authorWithoutProjectionUpdatedNow: AuthorDocument = {
	...authorWithIdInternal,
	createdAt: new Date('2018-02-20T00:00:00.000Z'),
	updatedAt: new Date()
}

export const parsedAuthorWithoutGenres: ApiAuthorProfile = {
	asin,
	description,
	image,
	name,
	region,
	similar
}

const authorWithoutGenresWithIdInternal: WithId<ApiAuthorProfile> = {
	_id,
	...parsedAuthorWithoutGenres
}

export const authorWithoutGenresWithoutProjection: AuthorDocument = {
	...authorWithoutGenresWithIdInternal,
	createdAt: new Date('2019-03-18T00:00:00.000Z'),
	updatedAt: new Date('2019-03-18T00:00:00.000Z')
}
