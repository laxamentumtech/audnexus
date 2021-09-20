import fetch from 'isomorphic-fetch'
// For merchandising_summary
import { htmlToText } from 'html-to-text'
import { AudibleInterface } from '../interfaces/audible/index'
import { ApiBookInterface } from '../interfaces/books/index'
import { AuthorInterface, NarratorInterface } from '../interfaces/people/index'

class ApiHelper {
    asin: string;
    reqUrl: string;
    constructor (asin: string) {
        this.asin = asin
        this.reqUrl = this.buildUrl(asin)
    }

    /**
     * Creates URL to use in fetchBook
     * @param {string} ASIN The Audible ID to base the URL on
     * @returns {string} full url to fetch.
     */
    buildUrl (ASIN: string): string {
        const baseUrl = 'https://api.audible.com/1.0/catalog/products'
        const resGroups =
            '?response_groups=contributors,product_desc,product_extended_attrs,product_attrs,media'
        const reqUrl = `${baseUrl}/${ASIN}${resGroups}`
        return reqUrl
    }

    /**
     * Fetches Audible API JSON
     * @param {scraperUrl} reqUrl the full url to fetch.
     * @returns {Promise<AudibleInterface>} response from Audible API
     */
    async fetchBook (): Promise<AudibleInterface | undefined> {
        const response = await fetch(this.reqUrl)
        if (!response.ok) {
            const message = `An error has occured while fetching from Audible API ${response.status}: ${this.asin}`
            throw new Error(message)
        } else {
            const json: AudibleInterface = await response.json()
            return json
        }
    }

    /**
     * Parses fetched Audible API data
     * @param {AudibleInterface} jsonRes fetched json response from api.audible.com
     * @returns {Promise<ApiBookInterface>} relevant data to keep
     */
    async parseResponse (jsonRes: AudibleInterface | undefined): Promise<ApiBookInterface> {
        // Base undefined check
        if (!jsonRes) {
            throw new Error('No API response to parse')
        }

        const inputJson = jsonRes.product
        const finalJson: any = {}

        let key: string
        let newKey: string
        const missingKeyMsg = (key: string) => {
            throw new Error(`Required key: ${key}, does not exist on: ${finalJson.asin}`)
        }
        const standardKeyHandling = (oldKey: string, newKey: string) => {
            if (oldKey in inputJson) {
                finalJson[newKey] = inputJson[oldKey]
            } else {
                missingKeyMsg(key)
            }
        }
        const optionalKeyHandling = (oldKey: string, newKey: string) => {
            if (oldKey in inputJson) {
                finalJson[newKey] = inputJson[oldKey]
            }
        }

        // Asin
        key = 'asin'
        newKey = key
        standardKeyHandling(key, newKey)

        // Authors
        key = 'authors'
        if (key in inputJson) {
            const authorArr: AuthorInterface[] = []
            // Loop through each person
            inputJson[key].forEach((person: AuthorInterface) => {
                const authorJson = <AuthorInterface>{}

                // Use asin for author if available
                if (person.asin) {
                    authorJson.asin = person.asin
                }
                authorJson.name = person.name
                authorArr.push(authorJson)
            })
            // Use final array as value
            finalJson[key] = authorArr
        } else {
            missingKeyMsg(key)
        }

        // Description
        // Clean description of html tags
        key = 'merchandising_summary'
        if (key in inputJson) {
            finalJson.description = htmlToText(inputJson[key], {
                wordwrap: false
            })
        } else {
            missingKeyMsg(key)
        }

        // FormatType
        key = 'format_type'
        newKey = 'formatType'
        optionalKeyHandling(key, newKey)

        // Image
        // Remove _SL500_ and rename to image
        key = 'product_images'
        if (key[500] in inputJson) {
            finalJson.image = inputJson[key][500].replace('_SL500_.', '')
        }

        // Language
        key = 'language'
        newKey = key
        standardKeyHandling(key, newKey)

        // Narrators
        key = 'narrators'
        if (key in inputJson) {
            const narratorArr: NarratorInterface[] = []
            // Loop through each person
            inputJson[key].forEach((person: NarratorInterface) => {
                const narratorJson = <NarratorInterface>{}
                narratorJson.name = person.name
                narratorArr.push(narratorJson)
            })
            // Use final array as value
            finalJson[key] = narratorArr
        }

        // PublisherName
        key = 'publisher_name'
        newKey = 'publisherName'
        standardKeyHandling(key, newKey)

        // ReleaseDate
        // Make it into a date object
        key = 'release_date'
        if (key in inputJson) {
            // Some releases use issue_date, try that if this fails
            if (!inputJson[key] && inputJson.issue_date) {
                key = 'issue_date'
            }
            const releaseDate = new Date(inputJson[key])
            finalJson.releaseDate = releaseDate
        } else {
            missingKeyMsg(key)
        }

        // RuntimeLengthMin
        key = 'runtime_length_min'
        newKey = 'runtimeLengthMin'
        optionalKeyHandling(key, newKey)

        // SeriesPrimary
        key = 'publication_name'
        newKey = 'publicationName'
        optionalKeyHandling(key, newKey)

        // Subtitle
        key = 'subtitle'
        newKey = key
        optionalKeyHandling(key, newKey)

        // Summary
        // Rename to summary
        key = 'publisher_summary'
        newKey = 'summary'
        standardKeyHandling(key, newKey)

        // Title
        key = 'title'
        newKey = key
        standardKeyHandling(key, newKey)

        return finalJson
    }
}

export default ApiHelper
