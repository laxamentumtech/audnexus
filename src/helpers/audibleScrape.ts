// Import interfaces
import { HtmlBookInterface, GenreInterface, SeriesInterface } from '../interfaces/books/index'
import fetch from 'isomorphic-fetch'
// For HTML scraping
import * as cheerio from 'cheerio'

class ScrapeHelper {
    asin: string;
    reqUrl: string;
    constructor (asin) {
        this.asin = asin
        this.reqUrl = this.buildUrl(asin)
    }

    /**
     * Creates URL to use in fetchBook
     * @param {string} ASIN The Audible ID to base the URL on
     * @returns {string} full url to fetch.
     */
    buildUrl (ASIN: string): string {
        const baseUrl = 'https://www.audible.com/pd'
        const reqUrl = `${baseUrl}/${ASIN}`
        return reqUrl
    }

    /**
     * Checks the presence of genres on html page and formats them into JSON
     * @param {NodeListOf<Element>} genres selected source from categoriesLabel
     * @returns {GenreInterface[]}
     */
    collectGenres (genres: cheerio.Cheerio<cheerio.Element>[]): GenreInterface[] | undefined {
        // Check and label each genre
        const genreArr: GenreInterface[] | undefined = genres.map((genre, index): any => {
            let thisGenre = {} as GenreInterface
            let asin: string
            let href: string
            const types: Array<string> = ['parent', 'child']
            if (genre.attr('href')) {
                href = genre.attr('href')!
                asin = this.getAsinFromUrl(href)
                if (genre.text() && asin) {
                    thisGenre = {
                        asin: asin,
                        name: genre.text(),
                        type: types[index]
                    }
                }
                return thisGenre
            } else {
                console.log(`Genre ${index} asin not available on: ${this.asin}`)
            }
            return undefined
        }) as GenreInterface[]

        return genreArr
    }

    /**
     * Checks the presence of series' on html page and formats them into JSON
     * @param {NodeListOf<Element>} series selected source from seriesLabel
     * @param {string} seriesRaw innerHTML of the series node
     * @returns {SeriesInterface[]}
     */
    collectSeries (series: cheerio.Cheerio<cheerio.Element>[], seriesRaw: string): SeriesInterface[] | undefined {
        const bookPos = this.getBookFromHTML(seriesRaw)

        // What is the singular of series? Who knows
        const seriesArr: SeriesInterface[] | undefined = series.map((serie, index): any => {
            const thisSeries = {} as SeriesInterface
            let asin: string
            let href: string
            if (serie.attr('href')) {
                href = serie.attr('href')!
                asin = this.getAsinFromUrl(href)

                if (serie.text()) {
                    thisSeries.asin = asin
                    thisSeries.name = serie.text()

                    if (bookPos && bookPos[0]) {
                        thisSeries.position = bookPos[0]
                    }

                    return thisSeries
                } else {
                    console.log(`Series ${index} name not available on: ${this.asin}`)
                }
            } else {
                console.log(`Series ${index} asin not available on: ${this.asin}`)
            }
            return undefined
        }) as SeriesInterface[]

        return seriesArr
    }

    /**
     * Fetches the html page and checks it's response
     * @returns {Promise<cheerio.CheerioAPI | undefined>} return text from the html page
     */
    async fetchBook (): Promise<cheerio.CheerioAPI | undefined> {
        const response = await fetch(this.reqUrl)
        if (!response.ok) {
            const message = `An error has occured while scraping HTML ${response.status}: ${this.reqUrl}`
            if (response.status !== 404) {
                console.log(message)
            }
            return undefined
        } else {
            const text = await response.text()
            const dom = cheerio.load(text)
            return dom
        }
    }

    /**
     * Parses fetched HTML page to extract genres and series'
     * @param {JSDOM} dom the fetched dom object
     * @returns {HtmlBookInterface} genre and series.
     */
    async parseResponse (dom: cheerio.CheerioAPI | undefined): Promise<HtmlBookInterface | undefined> {
        // Base undefined check
        if (!dom) {
            return undefined
        }

        const genres = dom('li.categoriesLabel a')
        .toArray()
        .map(element => dom(element))

        const series = dom('li.seriesLabel a')
        .toArray()
        .map(element => dom(element))

        const returnJson = {
            genres: Array<GenreInterface>(genres.length),
            series: Array<SeriesInterface>(series.length)
        } as HtmlBookInterface

        // Genres
        if (genres.length) {
            returnJson.genres = this.collectGenres(genres)
        } else {
            console.log(`Genres not available on: ${this.asin}`)
        }

        // Series
        if (series.length) {
            const seriesRaw = dom('li.seriesLabel').html()!
            returnJson.series = this.collectSeries(series, seriesRaw)
        }

        return returnJson
    }

    // Helpers
    /**
     * Regex to return just the ASIN from the given URL
     * @param {string} url string to extract ASIN from
     * @returns {string} ASIN.
     */
    getAsinFromUrl (url: string): string {
        const asinRegex = /[0-9A-Z]{9}.+?(?=\?)/gm
        const ASIN = url.match(asinRegex)![0]
        return ASIN
    }

    /**
     * Regex to return just the book position from HTML input
     * @param {JSDOM} html block/object to retrieve book number from.
     * @returns {string} Cleaned book position string, like "Book 3"
     */
    getBookFromHTML (html): string {
        const bookRegex = /(Book ?(\d*\.)?\d+[+-]?[\d]?)/gm
        const matches = html.match(bookRegex)
        return matches
    }
}

export default ScrapeHelper
