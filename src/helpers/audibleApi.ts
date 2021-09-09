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
        // console.log(json);
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

        const snakeCaseToCamelCase = (input: string) =>
            input
                .split('_')
                .reduce(
                    (res, word, i) =>
                        i === 0
                            ? word.toLowerCase()
                            : `${res}${word.charAt(0).toUpperCase()}${word
                                    .substr(1)
                                    .toLowerCase()}`,
                    ''
                )

        const keysToKeep = [
            'asin',
            'title',
            'subtitle',
            'merchandising_summary',
            'publisher_summary',
            'authors',
            'narrators',
            'publication_name',
            'release_date',
            'publisher_name',
            'language',
            'runtime_length_min',
            'format_type',
            'product_images'
        ]

        keysToKeep.forEach((key) => {
            // Clean short description of html tags
            if (key === 'merchandising_summary') {
                finalJson.description = htmlToText(inputJson[key], {
                    wordwrap: false
                })
            // Narrators and authors both come in array objects
            } else if (key === 'authors') {
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
            } else if (key === 'narrators') {
                const narratorArr: NarratorInterface[] = []
                // Loop through each person
                inputJson[key].forEach((person: NarratorInterface) => {
                    const narratorJson = <NarratorInterface>{}
                    narratorJson.name = person.name
                    narratorArr.push(narratorJson)
                })
                // Use final array as value
                finalJson[key] = narratorArr
            // Make it into a date object
            } else if (key === 'release_date') {
                const releaseDate = new Date(inputJson[key])
                finalJson.releaseDate = releaseDate
            // Rename to long_summary
            } else if (key === 'publisher_summary') {
                finalJson.summary = inputJson[key]
            // Remove _SL500_ and rename to cover_image
            } else if (key === 'product_images') {
                finalJson.image = inputJson[key][500].replace('_SL500_.', '')
            // Common case
            } else if (inputJson[key]) {
                finalJson[snakeCaseToCamelCase(key)] = inputJson[key]
            }
        })

        return finalJson
    }
}

export default ApiHelper
