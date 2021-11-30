import ScrapeHelper from '../../../src/helpers/books/audibleScrape'
import { HtmlBookInterface } from '../../../src/interfaces/books'

let asinBad: string
let htmlBad: ScrapeHelper

let asinGood: string
let htmlGood: ScrapeHelper

// Run through known book data to test responses
describe('When scraping Project Hail Mary genres from Audible', () => {
    let response: HtmlBookInterface
    beforeAll((done) => {
        asinGood = 'B08G9PRS1K'
        htmlGood = new ScrapeHelper(asinGood)
        htmlGood.fetchBook().then(result => {
            htmlGood.parseResponse(result).then(result => {
                response = result!
                done()
            })
        })
    })

    it('returned 5 genres', () => {
        expect(response.genres?.length).toBe(5)
    })

    it('returned genre 1 asin', () => {
        expect(response.genres![0].asin).toBe('18580606011')
    })

    it('returned genre 1 name', () => {
        expect(response.genres![0].name).toBe('Science Fiction & Fantasy')
    })

    it('returned genre 1 type', () => {
        expect(response.genres![0].type).toBe('genre')
    })

    it('returned genre 2 asin', () => {
        expect(response.genres![1].asin).toBe('18580628011')
    })

    it('returned genre 2 name', () => {
        expect(response.genres![1].name).toBe('Science Fiction')
    })

    it('returned genre 2 type', () => {
        expect(response.genres![1].type).toBe('genre')
    })
})

// Run through known book data to test responses
describe('When scraping Scorcerers Stone genres/series from Audible', () => {
    let response: HtmlBookInterface
    beforeAll((done) => {
        asinGood = 'B017V4IM1G'
        htmlGood = new ScrapeHelper(asinGood)
        htmlGood.fetchBook().then(result => {
            htmlGood.parseResponse(result).then(result => {
                response = result!
                done()
            })
        })
    })

    it('returned 2 genres', () => {
        expect(response.genres?.length).toBe(2)
    })

    it('returned genre 1 asin', () => {
        expect(response.genres![0].asin).toBe('18572091011')
    })

    it('returned genre 1 name', () => {
        expect(response.genres![0].name).toBe('Children\'s Audiobooks')
    })

    it('returned genre 1 type', () => {
        expect(response.genres![0].type).toBe('genre')
    })

    it('returned genre 2 asin', () => {
        expect(response.genres![1].asin).toBe('18572491011')
    })

    it('returned genre 2 name', () => {
        expect(response.genres![1].name).toBe('Literature & Fiction')
    })

    it('returned genre 2 type', () => {
        expect(response.genres![1].type).toBe('genre')
    })
})

// Run through single series book
describe('When fetching The Coldest Case from Audible HTML', () => {
    let response: HtmlBookInterface
    beforeAll((done) => {
        asinGood = 'B08C6YJ1LS'
        htmlGood = new ScrapeHelper(asinGood)
        htmlGood.fetchBook().then(result => {
            htmlGood.parseResponse(result).then(result => {
                response = result!
                done()
            })
        })
    })

    it('returned 2 genres', () => {
        expect(response.genres?.length).toBe(2)
    })

    it('returned genre 1 asin', () => {
        expect(response.genres![0].asin).toBe('18574597011')
    })

    it('returned genre 1 name', () => {
        expect(response.genres![0].name).toBe('Mystery, Thriller & Suspense')
    })

    it('returned genre 1 type', () => {
        expect(response.genres![0].type).toBe('genre')
    })

    it('returned genre 2 asin', () => {
        expect(response.genres![1].asin).toBe('18574621011')
    })

    it('returned genre 2 name', () => {
        expect(response.genres![1].name).toBe('Thriller & Suspense')
    })

    it('returned genre 2 type', () => {
        expect(response.genres![1].type).toBe('genre')
    })
})

// Run through known book data to test responses
describe('When scraping The Martian from Audible', () => {
    let response: any
    beforeAll((done) => {
        asinBad = 'B00B5HZGUG'
        htmlBad = new ScrapeHelper(asinBad)
        htmlBad.fetchBook().then(result => {
            response = result
            done()
        })
    })

    it('returned undefined', () => {
        expect(response).toBeUndefined()
    })
})

describe('When fetching a broken ASIN\'s HTML from Audible', () => {
    let response: HtmlBookInterface
    beforeAll((done) => {
        asinBad = 'B0036I54I6'
        htmlBad = new ScrapeHelper(asinBad)
        htmlBad.fetchBook().then(result => {
            htmlBad.parseResponse(result).then(result => {
                response = result!
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
//     let response: HtmlBookInterface
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
//         expect(response.genres!.length).toBeFalsy()
//     })
// })

// TODO find an asin which passes this test
// describe('When fetching a book with only 1 genre', () => {
//     let response: HtmlBookInterface
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
//         expect(response.genres![0]).toBeTruthy()
//     })

//     it('did not return 2nd genre', () => {
//         expect(response.genres![1]).toBeUndefined()
//     })
// })
