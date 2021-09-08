import fetch from 'isomorphic-fetch'
// For HTML scraping
import jsdom from 'jsdom'
const { JSDOM } = jsdom

class scrapeHelper {
    asin: any;
    reqUrl: string;
    constructor (asin) {
        this.asin = asin
        this.reqUrl = this.buildUrl(asin)
    }

    /**
     *
     * @param {string} ASIN The Audible ID to base the URL on
     * @returns {string} full url to fetch.
     */
    buildUrl (ASIN: string): string {
        const baseUrl = 'https://www.audible.com/pd'
        const reqUrl = `${baseUrl}/${ASIN}`
        return reqUrl
    }

    /**
     *
     * @param {buildUrl} reqUrl the full url to fetch.
     * @returns {json} data from parseResponse() function.
     */
    async fetchBook () {
        try {
            const response = await fetch(this.reqUrl)
            const text = await response.text()
            const dom = await new JSDOM(text)
            return this.parseResponse(dom)
        } catch (err) {
            return err
            // console.log(err);
        }
    }

    /**
     *
     * @param {JSDOM} dom the fetched dom object
     * @returns {json} genre and series.
     */
    parseResponse (dom) {
        interface Genre {
            name: string,
            id: string,
            type: string,
        }

        interface Series {
            name: string,
            id: string,
            position: string,
        }

        const returnJson = {
            genres: Array<Genre>(),
            series: Array<Series>()
        }

        // Genres
        const genres = dom.window.document.querySelectorAll(
            'li.categoriesLabel a'
        )
        if (genres.length) {
            const genreArr = new Array<Genre>()

            // Check parent genre
            if (genres[0]) {
                genreArr.push({
                    name: genres[0].textContent,
                    id: this.getAsinFromUrl(genres[0].getAttribute('href')),
                    type: 'parent'
                })
            }
            // Check child genre
            if (genres[1]) {
                genreArr.push({
                    name: genres[1].textContent,
                    id: this.getAsinFromUrl(genres[1].getAttribute('href')),
                    type: 'child'
                })
            }

            returnJson.genres = genreArr
        }

        // Series
        const series = dom.window.document.querySelectorAll('li.seriesLabel a')
        if (series.length) {
            const seriesRaw =
                dom.window.document.querySelector('li.seriesLabel').innerHTML
            const book_pos = this.getBookFromHTML(seriesRaw)
            const seriesArr = new Array<Series>()

            if (series[0]) {
                seriesArr.push({
                    name: series[0].textContent,
                    id: this.getAsinFromUrl(series[0].getAttribute('href')),
                    position: book_pos[0]
                })
            }
            if (series[1]) {
                seriesArr.push({
                    name: series[1].textContent,
                    id: this.getAsinFromUrl(series[1].getAttribute('href')),
                    position: book_pos[1]
                })
            }

            returnJson.series = seriesArr
        }

        return returnJson
    }

    // Helpers
    /**
     *
     * @param {string} url string to extract ASIN from
     * @returns {string} ASIN.
     */
    getAsinFromUrl (url: string): string {
        const asinRegex = /[0-9A-Z]{9}.+?(?=\?)/gm
        const ASIN = url.match(asinRegex)![0]
        return ASIN
    }

    /**
     *
     * @param {jsdom} html block/object to retrieve book number from.
     * @returns {string} Cleaned book position string, like "Book 3"
     */
    getBookFromHTML (html): string {
        const bookRegex = /(Book ?(\d*\.)?\d+[+-]?[\d]?)/gm
        const matches = html.match(bookRegex)
        return matches
    }
}

export default scrapeHelper
