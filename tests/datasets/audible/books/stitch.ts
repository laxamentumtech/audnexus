import { Book } from '#config/typing/books'
import { B08C6YJ1LS, B017V4IM1G, setupMinimalParsed } from '#tests/datasets/audible/books/api'
import { parsedB08C6YJ1LS, parsedB017V4IM1G } from '#tests/datasets/audible/books/scrape'

let description: string
let image: string

// Scorcerers Stone
description =
	'Harry Potter has never even heard of Hogwarts when the letters start dropping on the doormat at number four, Privet Drive. Addressed in green ink on yellowish parchment with a purple seal, they are swiftly confiscated by his grisly aunt and uncle....'
image = 'https://m.media-amazon.com/images/I/91eopoUCjLL.jpg'
export const combinedB017V4IM1G: Book = {
	...setupMinimalParsed(B017V4IM1G.product, description, image),
	...parsedB017V4IM1G
}
// The Coldest Case
description =
	"James Patterson's Detective Billy Harney is back, this time investigating murders in a notorious Chicago drug ring, which will lead him, his sister, and his new partner through a dangerous web of corrupt politicians, vengeful billionaires, and violent dark web conspiracies...."
image = 'https://m.media-amazon.com/images/I/91H9ynKGNwL.jpg'
export const combinedB08C6YJ1LS: Book = {
	...setupMinimalParsed(B08C6YJ1LS.product, description, image),
	...parsedB08C6YJ1LS
}
