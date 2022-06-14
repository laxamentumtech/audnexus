import ApiHelper from '#helpers/books/audible/api'
import ScrapeHelper from '#helpers/books/audible/scrape'
import { AudibleInterface } from '#interfaces/audible'
import { ApiBookInterface, BookInterface, HtmlBookInterface } from '#interfaces/books/index'
import type { CheerioAPI } from 'cheerio'

class StitchHelper {
    apiHelper: ApiHelper
    apiParsed: ApiBookInterface | undefined
    apiResponse: AudibleInterface | undefined
    asin: string
    scrapeHelper: ScrapeHelper
    scraperParsed: HtmlBookInterface | undefined
    scraperResponse: CheerioAPI | undefined
    tempJson!: Partial<BookInterface>

    constructor(asin: string) {
        this.asin = asin
        // Set up helpers
        this.apiHelper = new ApiHelper(asin)
        this.scrapeHelper = new ScrapeHelper(asin)
    }

    /**
     * Runs fetchBook functions from api and scrape helpers
     */
    async fetchSources() {
        const apiResponse = this.apiHelper.fetchBook()
        const scraperResponse = this.scrapeHelper.fetchBook()

        // Run fetch tasks in parallel
        try {
            this.apiResponse = await apiResponse
            this.scraperResponse = await scraperResponse
        } catch (err) {
            // TODO write errors
            throw new Error(``)
        }
    }

    /**
     * Runs parseResponse functions from api and scrape helpers
     */
    async parseResponses() {
        const apiParsed = this.apiHelper.parseResponse(this.apiResponse)
        const scraperParsed = this.scrapeHelper.parseResponse(this.scraperResponse)

        // Run parse tasks in parallel
        try {
            this.apiParsed = await apiParsed
            // Also create the partial json for genre use
            this.tempJson = this.apiParsed
            this.scraperParsed = await scraperParsed
        } catch (err) {
            // TODO write errors
            throw new Error(``)
        }
    }

    /**
     * Sets genres key in returned json if it exists
     */
    async includeGenres(): Promise<BookInterface> {
        if (this.scraperParsed && this.scraperParsed.genres!.length) {
            this.tempJson.genres = this.scraperParsed.genres
        }
        return this.tempJson as BookInterface
    }

    /**
     * Call functions in the class to parse final book JSON
     * @returns {Promise<BookInterface>}
     */
    async process(): Promise<BookInterface> {
        // Wait in order
        await this.fetchSources()
        await this.parseResponses()

        const stitchedGenres = await this.includeGenres()
        const bookJson: BookInterface = stitchedGenres
        return bookJson
    }
}

export default StitchHelper
