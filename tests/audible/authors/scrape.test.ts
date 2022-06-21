import ScrapeHelper from '#helpers/authors/audible/ScrapeHelper'
import { AuthorInterface } from '#interfaces/people'

const asinAndyWeir = 'B00G0WYW92'
const asinMissing = '103940202X'
const asinSimonPegg = 'B0034NFIOI'

// Run through known author data to test responses
describe('When scraping Andy Weir from Audible', () => {
    let response: AuthorInterface
    beforeAll(async () => {
        // Setup helpers
        const authorHelper = new ScrapeHelper(asinAndyWeir)
        // Setup variables
        response = await authorHelper.process()
    })

    it('returned a description', () => {
        expect(response.description).toBe(
            'ANDY WEIR built a two-decade career as a software engineer until the success of his first published novel, The Martian, allowed him to live out his dream of writing full-time. He is a lifelong space nerd and a devoted hobbyist of such subjects as relativistic physics, orbital mechanics, and the history of manned spaceflight. He also mixes a mean cocktail. He lives in California.'
        )
    })

    it('returned a name', () => {
        expect(response.name).toBe('Andy Weir')
    })

    it('returned an image', () => {
        expect(response.image).toBe(
            'https://images-na.ssl-images-amazon.com/images/S/amzn-author-media-prod/dcqug62o4s52ubd61ogont4t3l.jpg'
        )
    })

    it('returned 3 genres', () => {
        expect(response.genres?.length).toBe(3)
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

    it('returned genre 2 asin', () => {
        expect(response.genres?.[1].asin).toBe('18574597011')
    })

    it('returned genre 2 name', () => {
        expect(response.genres?.[1].name).toBe('Mystery, Thriller & Suspense')
    })

    it('returned genre 2 type', () => {
        expect(response.genres?.[1].type).toBe('genre')
    })

    it('returned genre 3 asin', () => {
        expect(response.genres?.[2].asin).toBe('18574426011')
    })

    it('returned genre 3 name', () => {
        expect(response.genres?.[2].name).toBe('Literature & Fiction')
    })

    it('returned genre 3 type', () => {
        expect(response.genres?.[2].type).toBe('genre')
    })
})

describe('When scraping an author with no description or image from Audible', () => {
    let response: AuthorInterface
    beforeAll(async () => {
        // Setup helpers
        const authorHelper = new ScrapeHelper(asinSimonPegg)
        // Setup variables
        response = await authorHelper.process()
    })

    it('returned NO description', () => {
        expect(response.description).toBeFalsy()
    })

    it('returned a name', () => {
        expect(response.name).toBe('Simon Pegg')
    })

    it('returned NO image', () => {
        expect(response.image).toBeFalsy()
    })

    it('returned 1 genre', () => {
        expect(response.genres?.length).toBe(1)
    })

    it('returned genre 1 asin', () => {
        expect(response.genres?.[0].asin).toBe('18571910011')
    })

    it('returned genre 1 name', () => {
        expect(response.genres?.[0].name).toBe('Arts & Entertainment')
    })

    it('returned genre 1 type', () => {
        expect(response.genres?.[0].type).toBe('genre')
    })
})

describe('When fetching a book as an author from Audible', () => {
    let authorHelper: ScrapeHelper
    beforeAll(() => {
        // Setup helpers
        authorHelper = new ScrapeHelper(asinMissing)
    })

    it('threw an error', async () => {
        await expect(authorHelper.fetchAuthor()).rejects.toThrowError(
            'An error occured while fetching Audible HTML. Response: 404, ASIN: 103940202X'
        )
    })
})
