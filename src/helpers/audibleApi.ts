import fetch from 'isomorphic-fetch'
// For merchandising_summary
import { htmlToText } from 'html-to-text'

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
    async fetchBook () {
        try {
            const response = await fetch(this.reqUrl)
            const json = await response.json()
            // console.log(json);
            return this.parseResponse(json)
        } catch (err) {
            return err
            // console.log(err);
        }
    }

    /**
     *
     * @param {json} jsonRes fetched json response from api.audible.com
     * @returns {json} relevant data to keep
     */
    parseResponse (jsonRes) {
        const inputJson = jsonRes.product
        const finalJson: any = {}

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
                finalJson.short_summary = htmlToText(inputJson[key], {
                    wordwrap: false
                })
            // Narrators and authors both come in array objects
            } else if (key === 'authors' || key === 'narrators') {
                interface Person {
                    asin?: string,
                    name: string,
                }
                const peopleArr: Person[] = []
                // Loop through each person
                inputJson[key].forEach((person: Person) => {
                    const personJson = <Person>{}

                    // Use asin for author if available
                    if (person.asin) {
                        personJson.asin = person.asin
                    }
                    personJson.name = person.name
                    peopleArr.push(personJson)
                })
                // Use final array as value
                finalJson[key] = peopleArr
            // Make it into a date object
            } else if (key === 'release_date') {
                const releaseDate = new Date(inputJson[key])
                finalJson[key] = releaseDate
                // Rename to long_summary
            } else if (key === 'publisher_summary') {
                finalJson.long_summary = inputJson[key]
            // Remove _SL500_ and rename to cover_image
            } else if (key === 'product_images') {
                finalJson.cover_image = inputJson[key][500].replace(
                    '_SL500_.',
                    ''
                )
            // Common case
            } else if (inputJson[key]) {
                finalJson[key] = inputJson[key]
            }
        })

        return finalJson
    }
}

export default ApiHelper
