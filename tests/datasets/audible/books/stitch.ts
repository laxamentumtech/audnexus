import { ApiBook, ApiGenre } from '#config/types'
import { B08C6YJ1LS, B017V4IM1G, setupMinimalParsed } from '#tests/datasets/audible/books/api'

// Scorcerers Stone
export const B017V4IM1Gcopyright = 1997
export const B017V4IM1Gdescription =
	'Harry Potter has never even heard of Hogwarts when the letters start dropping on the doormat at number four, Privet Drive. Addressed in green ink on yellowish parchment with a purple seal, they are swiftly confiscated by his grisly aunt and uncle....'
export const B017V4IM1Ggenres: ApiGenre[] = [
	{
		asin: '18572091011',
		name: "Children's Audiobooks",
		type: 'genre'
	},
	{
		asin: '18572586011',
		name: 'Science Fiction & Fantasy',
		type: 'tag'
	},
	{ asin: '18572587011', name: 'Fantasy & Magic', type: 'tag' },
	{ asin: '18572588011', name: 'Action & Adventure', type: 'tag' }
]
export const B017V4IM1Gimage = 'https://m.media-amazon.com/images/I/91eopoUCjLL.jpg'
export const combinedB017V4IM1G: ApiBook = setupMinimalParsed(
	B017V4IM1G.product,
	B017V4IM1Gcopyright,
	B017V4IM1Gdescription,
	B017V4IM1Gimage,
	B017V4IM1Ggenres
)
// The Coldest Case
export const B08C6YJ1LScopyright = 2020
export const B08C6YJ1LSdescription =
	"James Patterson's Detective Billy Harney is back, this time investigating murders in a notorious Chicago drug ring, which will lead him, his sister, and his new partner through a dangerous web of corrupt politicians, vengeful billionaires, and violent dark web conspiracies...."
export const B08C6YJ1LSgenres: ApiGenre[] = [
	{
		asin: '18574597011',
		name: 'Mystery, Thriller & Suspense',
		type: 'genre'
	},
	{ asin: '18574621011', name: 'Thriller & Suspense', type: 'tag' },
	{ asin: '18574623011', name: 'Crime Thrillers', type: 'tag' }
]
export const B08C6YJ1LSimage = 'https://m.media-amazon.com/images/I/91H9ynKGNwL.jpg'
export const combinedB08C6YJ1LS: ApiBook = setupMinimalParsed(
	B08C6YJ1LS.product,
	B08C6YJ1LScopyright,
	B08C6YJ1LSdescription,
	B08C6YJ1LSimage,
	B08C6YJ1LSgenres
)
