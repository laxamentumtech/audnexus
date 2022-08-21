import { ObjectId, WithId } from 'mongodb'

import { AuthorDocument } from '#config/models/Author'
import type { AuthorProfile } from '#config/typing/people'

const _id = new ObjectId('5c8f8f8f8f8f8f8f8f8f8f8f')
const asin = 'B012DQ3BCM'
const description =
	"JASON ANSPACH (1979- ) is the co-creator of Galaxy's Edge. He is an American author raised in a military family (Go Army!) known for pulse-pounding military science fiction and adventurous space operas that deftly blend action, suspense, and comedy. Together with his wife, their seven (not a typo) children, and a border collie named Charlotte, Jason resides in Puyallup, Washington. He remains undefeated at arm wrestling against his entire family. Galaxy's Edge: www.InTheLegion.com Author website: www.JasonAnspach.com facebook.com/authorjasonanspach twitter.com/jonspach"
const genres = [
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

export const parsedAuthor: AuthorProfile = {
	asin,
	description,
	genres,
	image,
	name
}

export const authorWithId: WithId<AuthorProfile> = {
	_id,
	...parsedAuthor
}

export const authorWithoutProjection: AuthorDocument = {
	...authorWithId,
	createdAt: new Date('2019-03-18T00:00:00.000Z'),
	updatedAt: new Date('2019-03-18T00:00:00.000Z')
}

export const authorWithoutProjectionUpdatedNow: AuthorDocument = {
	...authorWithoutProjection,
	createdAt: new Date('2018-02-20T00:00:00.000Z'),
	updatedAt: new Date()
}
