import { CheerioAPI } from 'cheerio'

import { HtmlBook } from '#config/typing/books'
import ScrapeHelper from '#helpers/books/audible/ScrapeHelper'

let asinBad: string
let htmlBad: ScrapeHelper

let asinGood: string
let htmlGood: ScrapeHelper

// Run through known book data to test responses
describe('When scraping Project Hail Mary genres from Audible', () => {
	let response: HtmlBook
	beforeAll((done) => {
		asinGood = 'B08G9PRS1K'
		htmlGood = new ScrapeHelper(asinGood)
		htmlGood.fetchBook().then((fetchResult) => {
			htmlGood.parseResponse(fetchResult).then((parseResult) => {
				response = parseResult!
				done()
			})
		})
	})

	it('returned 4 genres', () => {
		expect(response.genres?.length).toBe(4)
	})

	it('returned genre 1 asin', () => {
		expect(response.genres?.[0].asin).toBe('18580606011')
	})

	it('returned genre 1 name', () => {
		expect(response.genres?.[0].name).toBe('Science Fiction & Fantasy')
	})

	it('returned genre 1 type', () => {
		expect(response.genres?.[0].type).toBe('genre')
	})

	it('returned tag 1 asin', () => {
		expect(response.genres?.[1].asin).toBe('18580629011')
	})

	it('returned tag 1 name', () => {
		expect(response.genres?.[1].name).toBe('Adventure')
	})

	it('returned tag 1 type', () => {
		expect(response.genres?.[1].type).toBe('tag')
	})
})

// Run through known book data to test responses
describe('When scraping Scorcerers Stone genres/series from Audible', () => {
	let response: HtmlBook
	beforeAll((done) => {
		asinGood = 'B017V4IM1G'
		htmlGood = new ScrapeHelper(asinGood)
		htmlGood.fetchBook().then((fetchResult) => {
			htmlGood.parseResponse(fetchResult).then((parseResult) => {
				response = parseResult!
				done()
			})
		})
	})

	it('returned 5 genres', () => {
		expect(response.genres?.length).toBe(5)
	})

	it('returned genre 1 asin', () => {
		expect(response.genres?.[0].asin).toBe('18572091011')
	})

	it('returned genre 1 name', () => {
		expect(response.genres?.[0].name).toBe("Children's Audiobooks")
	})

	it('returned genre 1 type', () => {
		expect(response.genres?.[0].type).toBe('genre')
	})

	it('returned tag 1 asin', () => {
		expect(response.genres?.[1].asin).toBe('18572091011')
	})

	it('returned tag 1 name', () => {
		expect(response.genres?.[1].name).toBe("Children's Audiobooks")
	})

	it('returned tag 1 type', () => {
		expect(response.genres?.[1].type).toBe('tag')
	})

	it('returned tag 2 asin', () => {
		expect(response.genres?.[2].asin).toBe('18572505011')
	})

	it('returned tag 2 name', () => {
		expect(response.genres?.[2].name).toBe('Family Life')
	})

	it('returned tag 2 type', () => {
		expect(response.genres?.[2].type).toBe('tag')
	})

	it('returned tag 3 asin', () => {
		expect(response.genres?.[3].asin).toBe('18572587011')
	})

	it('returned tag 3 name', () => {
		expect(response.genres?.[3].name).toBe('Fantasy & Magic')
	})

	it('returned tag 3 type', () => {
		expect(response.genres?.[3].type).toBe('tag')
	})

	it('returned tag 4 asin', () => {
		expect(response.genres?.[4].asin).toBe('18580607011')
	})

	it('returned tag 4 name', () => {
		expect(response.genres?.[4].name).toBe('Fantasy')
	})

	it('returned tag 4 type', () => {
		expect(response.genres?.[4].type).toBe('tag')
	})
})

// Run through single series book
describe('When fetching The Coldest Case from Audible HTML', () => {
	let response: HtmlBook
	beforeAll((done) => {
		asinGood = 'B08C6YJ1LS'
		htmlGood = new ScrapeHelper(asinGood)
		htmlGood.fetchBook().then((fetchResult) => {
			htmlGood.parseResponse(fetchResult).then((parseResult) => {
				response = parseResult!
				done()
			})
		})
	})

	it('returned 2 genres', () => {
		expect(response.genres?.length).toBe(2)
	})

	it('returned genre 1 asin', () => {
		expect(response.genres?.[0].asin).toBe('18574597011')
	})

	it('returned genre 1 name', () => {
		expect(response.genres?.[0].name).toBe('Mystery, Thriller & Suspense')
	})

	it('returned genre 1 type', () => {
		expect(response.genres?.[0].type).toBe('genre')
	})

	it('returned tag 1 asin', () => {
		expect(response.genres?.[1].asin).toBe('18574623011')
	})

	it('returned tag 1 name', () => {
		expect(response.genres?.[1].name).toBe('Crime Thrillers')
	})

	it('returned tag 1 type', () => {
		expect(response.genres?.[1].type).toBe('tag')
	})
})

// Run through known book data to test responses
describe('When scraping The Martian from Audible', () => {
	let response: CheerioAPI | undefined
	beforeAll((done) => {
		asinBad = 'B00B5HZGUG'
		htmlBad = new ScrapeHelper(asinBad)
		htmlBad.fetchBook().then((result: CheerioAPI | undefined) => {
			response = result
			done()
		})
	})

	it('returned undefined', () => {
		expect(response).toBeUndefined()
	})
})

describe("When fetching a broken ASIN's HTML from Audible", () => {
	let response: HtmlBook | undefined
	beforeAll((done) => {
		asinBad = 'B0036I54I6'
		htmlBad = new ScrapeHelper(asinBad)
		htmlBad.fetchBook().then((fetchResult: CheerioAPI | undefined) => {
			htmlBad.parseResponse(fetchResult).then((parseResult: HtmlBook | undefined) => {
				response = parseResult!
				done()
			})
		})
	})

	it('returned undefined', () => {
		expect(response).toBeUndefined()
	})
})

// TODO find an asin which passes this test
// describe('When fetching a book with no genres', () => {
//     let response: HtmlBook
//     beforeAll((done) => {
//         asinBad = 'B007NMU87I'
//         htmlBad = new ScrapeHelper(asinBad)
//         htmlBad.fetchBook().then(result => {
//             htmlBad.parseResponse(result).then(result => {
//                 response = result!
//                 done()
//             })
//         })
//     })

//     it('returned no genres', () => {
//         expect(response.genres.length).toBeFalsy()
//     })
// })

// TODO find an asin which passes this test
// describe('When fetching a book with only 1 genre', () => {
//     let response: HtmlBook
//     beforeAll((done) => {
//         asinBad = 'B017JDRBUW'
//         htmlBad = new ScrapeHelper(asinBad)
//         htmlBad.fetchBook().then(result => {
//             htmlBad.parseResponse(result).then(result => {
//                 response = result!
//                 done()
//             })
//         })
//     })

//     it('returned 1st genre', () => {
//         expect(response.genres[0]?).toBeTruthy()
//     })

//     it('did not return 2nd genre', () => {
//         expect(response.genres[1]?).toBeUndefined()
//     })
// })
