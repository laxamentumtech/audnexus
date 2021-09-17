// Import interfaces
import { HtmlBookInterface, GenreInterface, SeriesInterface } from '../interfaces/books/index'
import fetch from 'isomorphic-fetch'
// For HTML scraping
import { JSDOM } from 'jsdom'

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

    collectGenres (genres): GenreInterface[] {
        const genreArr: GenreInterface[] = []

        // Check parent genre
        if (genres[0]) {
            let asin: string
            let href: string

            if (genres[0].getAttribute('href')) {
                href = genres[0].getAttribute('href')!
                asin = this.getAsinFromUrl(href)
                if (genres[0].textContent && asin) {
                    genreArr.push({
                        asin: asin,
                        name: genres[0].textContent,
                        type: 'parent'
                    })
                }
            }
        }

        // Check child genre
        if (genres[1]) {
            let asin: string
            let href: string

            if (genres[1].getAttribute('href')) {
                href = genres[1].getAttribute('href')!
                asin = this.getAsinFromUrl(href)
                if (genres[1].textContent && asin) {
                    genreArr.push({
                        asin: asin,
                        name: genres[1].textContent,
                        type: 'child'
                    })
                }
            }
        }

        return genreArr
    }

    collectSeries (series, dom): SeriesInterface[] {
        const seriesRaw = dom.window.document.querySelector('li.seriesLabel')!.innerHTML
        const bookPos = this.getBookFromHTML(seriesRaw)
        const seriesArr: SeriesInterface[] = []

        if (series[0]) {
            const seriesPrimary = {} as SeriesInterface
            let asin: string
            let href: string

            if (series[0].getAttribute('href')) {
                href = series[0].getAttribute('href')!
                asin = this.getAsinFromUrl(href)

                if (series[0].textContent) {
                    seriesPrimary.asin = asin
                    seriesPrimary.name = series[0].textContent

                    if (bookPos && bookPos[0]) {
                        seriesPrimary.position = bookPos[0]
                    }

                    seriesArr.push(seriesPrimary)
                }
            }
        }

        if (series[1]) {
            const seriesSecondary = {} as SeriesInterface
            let asin: string
            let href: string

            if (series[1].getAttribute('href')) {
                href = series[1].getAttribute('href')!
                asin = this.getAsinFromUrl(href)

                if (series[1].textContent) {
                    seriesSecondary.asin = asin
                    seriesSecondary.name = series[1].textContent

                    if (bookPos && bookPos[1]) {
                        seriesSecondary.position = bookPos[1]
                    }

                    seriesArr.push(seriesSecondary)
                }
            }
        }
        return seriesArr
    }

    /**
     * Fetches the html page and checks it's response
     * @returns {Promise<JSDOM | undefined>} return text from the html page
     */
    async fetchBook (): Promise<JSDOM | undefined> {
        const response = await fetch(this.reqUrl)
        if (!response.ok) {
            const message = `An error has occured while scraping HTML ${response.status}: ${this.reqUrl}`
            console.log(message)
            return undefined
        } else {
            const text = await response.text()
            const dom = new JSDOM(text)
            return dom
        }
    }

    /**
     * Parses fetched HTML page to extract genres and series'
     * @param {JSDOM} dom the fetched dom object
     * @returns {HtmlBookInterface} genre and series.
     */
    async parseResponse (dom: JSDOM | undefined): Promise<HtmlBookInterface | undefined> {
        // Base undefined check
        if (!dom) {
            return undefined
        }

        const genres = dom.window.document.querySelectorAll(
            'li.categoriesLabel a'
            )
        const series = dom.window.document.querySelectorAll('li.seriesLabel a')

        const returnJson = {
            genres: Array<GenreInterface>(genres.length),
            series: Array<SeriesInterface>(series.length)
        }

        // Genres
        if (genres.length) {
            returnJson.genres = this.collectGenres(genres)
        }

        // Series
        if (series.length && dom.window.document.querySelector('li.seriesLabel')) {
            returnJson.series = this.collectSeries(series, dom)
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
