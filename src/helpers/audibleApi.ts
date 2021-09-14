import fetch from 'isomorphic-fetch'
// For merchandising_summary
import { htmlToText } from 'html-to-text'
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
     *
     * @param {string} ASIN The Audible ID to base the URL on
     * @returns {string} full url to fetch.
     */
    buildUrl (ASIN: string): string {
        const baseUrl = 'https://api.audible.com/1.0/catalog/products'
        const resGroups =
            '?response_groups=contributors,product_desc,product_extended_attrs,product_attrs,media'
        const reqUrl = `${baseUrl}/${ASIN}/${resGroups}`
        return reqUrl
    }

    /**
     *
     * @param {scraperUrl} reqUrl the full url to fetch.
     * @returns {JSON} response from Audible API
     */
    async fetchBook (): Promise<ApiBookInterface> {
        const response = await fetch(this.reqUrl)
        const json = await response.json()
        // console.log(json)
        return this.parseResponse(json)
    }

    /**
     *
     * @param {json} jsonRes fetched json response from api.audible.com
     * @returns {ApiBookInterface} relevant data to keep
     */
    parseResponse (jsonRes): ApiBookInterface {
        const inputJson = jsonRes.product
        const finalJson: any = {}

        let key: string
        const missingKeyMsg = (key: string) => console.log(`Key: ${key}, does not exist on: ${finalJson.asin}`)

        // Asin
        key = 'asin'
        if (key in inputJson) {
            finalJson[key] = inputJson[key]
        } else {
            missingKeyMsg(key)
        }

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
        if (key in inputJson) {
            finalJson.formatType = inputJson[key]
        } else {
            missingKeyMsg(key)
        }

        // Image
        // Remove _SL500_ and rename to image
        key = 'product_images'
        if (key in inputJson) {
            finalJson.image = inputJson[key][500].replace('_SL500_.', '')
        }

        // Language
        key = 'language'
        if (key in inputJson) {
            finalJson[key] = inputJson[key]
        } else {
            missingKeyMsg(key)
        }

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
        } else {
            missingKeyMsg(key)
        }

        // PublisherName
        key = 'publisher_name'
        if (key in inputJson) {
            finalJson.publisherName = inputJson[key]
        } else {
            missingKeyMsg(key)
        }

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
        if (key in inputJson) {
            finalJson.runtimeLengthMin = inputJson[key]
        } else {
            missingKeyMsg(key)
        }

        // SeriesPrimary
        key = 'publication_name'
        if (key in inputJson) {
            finalJson.publicationName = inputJson[key]
        }

        // Subtitle
        key = 'subtitle'
        if (key in inputJson) {
            finalJson[key] = inputJson[key]
        }

        // Summary
        // Rename to summary
        key = 'publisher_summary'
        if (key in inputJson) {
            finalJson.summary = inputJson[key]
        }

        // Title
        key = 'title'
        if (key in inputJson) {
            finalJson[key] = inputJson[key]
        } else {
            missingKeyMsg(key)
        }

        return finalJson
    }
}

export default ApiHelper
