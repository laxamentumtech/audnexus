import ScrapeHelper from '../../src/helpers/audibleScrape'
import { HtmlBookInterface } from '../../src/interfaces/books'

// Run through known book data to test responses
const asinProjectHailMary: string = 'B08G9PRS1K'
const htmlProjectHailMary = new ScrapeHelper(asinProjectHailMary)

describe('When scraping Project Hail Mary genres from Audible', () => {
    let response: HtmlBookInterface
    beforeAll((done) => {
        htmlProjectHailMary.fetchBook().then(result => {
            htmlProjectHailMary.parseResponse(result).then(result => {
                response = result!
                done()
            })
        })
    })

    it('returned 2 genres', () => {
        expect(response.genres?.length).toBe(2)
    })

    it('returned genre 1 asin', () => {
        expect(response.genres![0].asin).toBe('18580606011')
    })

    it('returned genre 1 name', () => {
        expect(response.genres![0].name).toBe('Science Fiction & Fantasy')
    })

    it('returned genre 1 type', () => {
        expect(response.genres![0].type).toBe('parent')
    })

    it('returned genre 2 asin', () => {
        expect(response.genres![1].asin).toBe('18580628011')
    })

    it('returned genre 2 name', () => {
        expect(response.genres![1].name).toBe('Science Fiction')
    })

    it('returned genre 2 type', () => {
        expect(response.genres![1].type).toBe('child')
    })

    it('returned 0 series', () => {
        expect(response.series!.length).toBe(0)
    })

    it('returned no primary series', () => {
        expect(response.series![0]).toBeUndefined()
    })

    it('returned no secondary series', () => {
        expect(response.series![1]).toBeUndefined()
    })
})

    // Run through known book data to test responses
const asinSorcerersStone: string = 'B017V4IM1G'
const htmlSorcerersStone = new ScrapeHelper(asinSorcerersStone)

describe('When scraping Scorcerers Stone genres/series from Audible', () => {
    let response: HtmlBookInterface
    beforeAll((done) => {
        htmlSorcerersStone.fetchBook().then(result => {
            htmlSorcerersStone.parseResponse(result).then(result => {
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
        expect(response.genres![0].type).toBe('parent')
    })

    it('returned genre 2 asin', () => {
        expect(response.genres![1].asin).toBe('18572491011')
    })

    it('returned genre 2 name', () => {
        expect(response.genres![1].name).toBe('Literature & Fiction')
    })

    it('returned genre 2 type', () => {
        expect(response.genres![1].type).toBe('child')
    })

    it('returned 2 series', () => {
        expect(response.series!.length).toBe(2)
    })

    it('returned a primary series asin', () => {
        expect(response.series![0].asin).toBe('B07CM5ZDJL')
    })

    it('returned a primary series name', () => {
        expect(response.series![0].name).toBe('Wizarding World')
    })

    it('returned a primary series position', () => {
        expect(response.series![0].position).toBe('Book 1')
    })

    it('returned a secondary series asin', () => {
        expect(response.series![1].asin).toBe('B0182NWM9I')
    })

    it('returned a secondary series name', () => {
        expect(response.series![1].name).toBe('Harry Potter')
    })

    it('returned a secondary series position', () => {
        expect(response.series![1].position).toBe('Book 1')
    })
})

const asinColdestCase: string = 'B08C6YJ1LS'
const htmlColdestCase = new ScrapeHelper(asinColdestCase)

describe('When fetching The Coldest Case from Audible API', () => {
    let response: HtmlBookInterface
    beforeAll((done) => {
        htmlColdestCase.fetchBook().then(result => {
            htmlColdestCase.parseResponse(result).then(result => {
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
        expect(response.genres![0].type).toBe('parent')
    })

    it('returned genre 2 asin', () => {
        expect(response.genres![1].asin).toBe('18574621011')
    })

    it('returned genre 2 name', () => {
        expect(response.genres![1].name).toBe('Thriller & Suspense')
    })

    it('returned genre 2 type', () => {
        expect(response.genres![1].type).toBe('child')
    })

    it('returned 1 series', () => {
        expect(response.series!.length).toBe(1)
    })

    it('returned a primary series asin', () => {
        expect(response.series![0].asin).toBe('B08RLSPY4J')
    })

    it('returned a primary series name', () => {
        expect(response.series![0].name).toBe('A Billy Harney Thriller')
    })

    it('returned a primary series position', () => {
        expect(response.series![0].position).toBe('Book 0.5')
    })

    it('returned no secondary series', () => {
        expect(response.series![1]).toBeUndefined()
    })
})

// Run through known book data to test responses
const asinMartian: string = 'B00B5HZGUG'
const htmlMartian = new ScrapeHelper(asinMartian)

describe('When scraping The Martian from Audible', () => {
    let response: any
    beforeAll((done) => {
        htmlMartian.fetchBook().then(result => {
            response = result
            done()
        })
    })

    it('returned undefined', () => {
        expect(response).toBeUndefined()
    })
})
