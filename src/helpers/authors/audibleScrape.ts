// Import interfaces
import { AuthorInterface } from '../../interfaces/people/index'
import { GenreInterface } from '../../interfaces/audible'
import fetch from 'isomorphic-fetch'
// For HTML scraping
import * as cheerio from 'cheerio'
import SharedHelper from '../shared'
import { htmlToText } from 'html-to-text'

class ScrapeHelper {
    asin: string;
    reqUrl: string;
    constructor (asin: string) {
        this.asin = asin
        const helper = new SharedHelper()
        const baseDomain: string = 'https://www.audible.com'
        const baseUrl: string = 'author'
        this.reqUrl = helper.buildUrl(asin, baseDomain, baseUrl)
    }

    /**
     * Checks the presence of genres on html page and formats them into JSON
     * @param {NodeListOf<Element>} genres selected source from categoriesLabel
     * @returns {GenreInterface[]}
     */
    collectGenres (genres: cheerio.Cheerio<cheerio.Element>[], type: string): GenreInterface[] | undefined {
        // Check and label each genre
        const genreArr: GenreInterface[] | undefined = genres.map((genre, index): any => {
            let thisGenre = {} as GenreInterface
            let asin: string
            let href: string
            if (genre.attr('href')) {
                href = genre.attr('href')!
                asin = this.getAsinFromUrl(href)
                if (genre.text() && asin) {
                    thisGenre = {
                        asin: asin,
                        name: genre.children().text(),
                        type: type
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
     * Fetches the html page and checks it's response
     * @returns {Promise<cheerio.CheerioAPI | undefined>} return text from the html page
     */
    async fetchBook (): Promise<cheerio.CheerioAPI> {
        const response = await fetch(this.reqUrl)
        if (!response.ok) {
            const message = `An error occured while fetching Audible HTML. Response: ${response.status}, ASIN: ${this.asin}`
            throw new Error(message)
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
    async parseResponse ($: cheerio.CheerioAPI | undefined): Promise<AuthorInterface> {
        // Base undefined check
        if (!$) {
            throw new Error('No response from HTML')
        }

        const returnJson = {} as AuthorInterface

        // ID
        returnJson.asin = this.asin

        // Bio.
        try {
            returnJson.description = htmlToText(
                $('div.bc-expander-content').children().text(),
                { wordwrap: false }
            )
        } catch (err) {
            console.log(`Bio not available on: ${this.asin}`)
        }

        // Genres.
        try {
            const genres = $('div.contentPositionClass div.bc-box a.bc-color-link')
            .toArray()
            .map(element => $(element))
            returnJson.genres = this.collectGenres(genres, 'genre')
        } catch (err) {
            console.log(`Genres not available on: ${this.asin}`)
        }

        // Image.
        try {
            // We'll ask for a *slightly* larger than postage-stamp-sized pic...
            returnJson.image = $('img.author-image-outline')[0].attribs.src.replace('__01_SX120_CR0,0,120,120__.', '')
        } catch (err) {
            console.log(`Image not available on: ${this.asin}`)
        }

        // Name.
        try {
            // Workaround data error: https://github.com/cheeriojs/cheerio/issues/1854
            returnJson.name = ($('h1.bc-text-bold')[0].children[0] as any).data
            if (!returnJson.name) {
                throw new Error('Author name not available')
            }
        } catch (err) {
            console.error(err)
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
}

export default ScrapeHelper
