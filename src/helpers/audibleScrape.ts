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
    collectGenres (genres: cheerio.Cheerio<cheerio.Element>[]): GenreInterface[] {
        const genreArr: GenreInterface[] = []

        let asin: string
        let href: string
        // Check parent genre
        if (genres[0].attr('href')) {
            href = genres[0].attr('href')!
            asin = this.getAsinFromUrl(href)
            if (genres[0].text() && asin) {
                genreArr.push({
                    asin: asin,
                    name: genres[0].text(),
                    type: 'parent'
                })
            }
        } else {
            console.log(`Genre 1 asin not available on: ${this.asin}`)
        }

        // Check child genre
        if (genres[1]) {
            if (genres[1].attr('href')) {
                href = genres[1].attr('href')!
                asin = this.getAsinFromUrl(href)
                if (genres[1].text() && asin) {
                    genreArr.push({
                        asin: asin,
                        name: genres[1].text(),
                        type: 'child'
                    })
                }
            } else {
                console.log(`Genre 2 asin not available on: ${this.asin}`)
            }
        } else {
            console.log(`Genre 2 not available on: ${this.asin}`)
        }

        return genreArr
    }

    /**
     * Checks the presence of series' on html page and formats them into JSON
     * @param {NodeListOf<Element>} series selected source from seriesLabel
     * @param {string} seriesRaw innerHTML of the series node
     * @returns {SeriesInterface[]}
     */
    collectSeries (series: cheerio.Cheerio<cheerio.Element>[], seriesRaw: string): SeriesInterface[] {
        const bookPos = this.getBookFromHTML(seriesRaw)
        const seriesArr: SeriesInterface[] = []

        const seriesPrimary = {} as SeriesInterface
        let asin: string
        let href: string

        // Primary series
        if (series[0].attr('href')) {
            href = series[0].attr('href')!
            asin = this.getAsinFromUrl(href)

            if (series[0].text()) {
                seriesPrimary.asin = asin
                seriesPrimary.name = series[0].text()

                if (bookPos && bookPos[0]) {
                    seriesPrimary.position = bookPos[0]
                }

                seriesArr.push(seriesPrimary)
            } else {
                console.log(`Series 1 name not available on: ${this.asin}`)
            }
        } else {
            console.log(`Series 1 asin not available on: ${this.asin}`)
        }

        // Secondary series
        if (series[1]) {
            const seriesSecondary = {} as SeriesInterface

            if (series[1].attr('href')) {
                href = series[1].attr('href')!
                asin = this.getAsinFromUrl(href)

                if (series[1].text()) {
                    seriesSecondary.asin = asin
                    seriesSecondary.name = series[1].text()

                    if (bookPos && bookPos[1]) {
                        seriesSecondary.position = bookPos[1]
                    }

                    seriesArr.push(seriesSecondary)
                } else {
                    console.log(`Series 2 name not available on: ${this.asin}`)
                }
            } else {
                console.log(`Series 2 asin not available on: ${this.asin}`)
            }
        }

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
        }

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
