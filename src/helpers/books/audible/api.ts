import SharedHelper from '#helpers/shared'
import { AudibleInterface, AudibleSeries } from '#interfaces/audible/index'
import { ApiBookInterface, SeriesInterface } from '#interfaces/books/index'
import { AuthorInterface, NarratorInterface } from '#interfaces/people/index'
import { htmlToText } from 'html-to-text'
import fetch from 'isomorphic-fetch'

class ApiHelper {
    asin: string
    reqUrl: string
    constructor(asin: string) {
        this.asin = asin
        const helper = new SharedHelper()
        const baseDomain: string = 'https://api.audible.com'
        const baseUrl: string = '1.0/catalog/products'
        const params =
            '?response_groups=contributors,product_desc,product_extended_attrs,product_attrs,media,rating,series&image_sizes=500,1024'
        this.reqUrl = helper.buildUrl(asin, baseDomain, baseUrl, params)
    }

    /**
     * Fetches Audible API JSON
     * @param {scraperUrl} reqUrl the full url to fetch.
     * @returns {Promise<AudibleInterface>} response from Audible API
     */
    async fetchBook(): Promise<AudibleInterface | undefined> {
        const response = await fetch(this.reqUrl)
        if (!response.ok) {
            const message = `An error has occured while fetching from Audible API. Response: ${response.status}, ASIN: ${this.asin}`
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
    async parseResponse(jsonRes: AudibleInterface | undefined): Promise<ApiBookInterface> {
        // Base undefined check
        if (!jsonRes) {
            throw new Error('No API response to parse')
        }
        const inputJson = jsonRes.product

        const missingKeyMsg = (key: string) => {
            throw new Error(`Required key: ${key}, does not exist on: ${inputJson.asin}`)
        }

        // Check all required keys present
        if (!inputJson.asin) missingKeyMsg('asin')
        if (!inputJson.authors) missingKeyMsg('authors')
        if (!inputJson.format_type) missingKeyMsg('format_type')
        if (!inputJson.language) missingKeyMsg('language')
        if (!inputJson.merchandising_summary) missingKeyMsg('merchandising_summary')
        if (!inputJson.product_images) missingKeyMsg('product_images')
        if (!inputJson.publisher_name) missingKeyMsg('publisher_name')
        if (!inputJson.release_date) missingKeyMsg('release_date')
        if (!inputJson.runtime_length_min) missingKeyMsg('runtime_length_min')
        if (!inputJson.publisher_summary) missingKeyMsg('publisher_summary')
        if (!inputJson.title) missingKeyMsg('title')

        // Image
        const getHighResImage = () => {
            // Sanity check
            if (!inputJson.product_images || inputJson.product_images.length) return ''

            // Try for higher res first
            if (1024 in inputJson.product_images) {
                return inputJson.product_images[1024].replace('_SL1024_.', '')
            }
            if (500 in inputJson.product_images) {
                return inputJson.product_images[500].replace('_SL1024_.', '')
            }
            return ''
        }
        // Release date
        const getReleaseDate = () => {
            let releaseDate: Date
            // Some releases use issue_date, try that if this fails
            if (!inputJson.release_date && inputJson.issue_date) {
                releaseDate = new Date(inputJson.issue_date)
            } else {
                releaseDate = new Date(inputJson.release_date)
            }
            // Check that release date isn't in the future
            const now = new Date()
            if (releaseDate > now) {
                throw new Error('Release date is in the future')
            }
            return releaseDate
        }
        // Series
        const getSeries = (series: AudibleSeries) => {
            const seriesJson = <SeriesInterface>{}
            // ASIN
            seriesJson.asin = series.asin ? series.asin : undefined
            // Title
            if (!series.title) return undefined
            seriesJson.name = series.title
            // Position
            seriesJson.position = series.sequence ? series.sequence : undefined
            return seriesJson
        }
        // Find primary series
        const getSeriesPrimary = (allSeries: AudibleSeries[]) => {
            if (!allSeries) return undefined
            let seriesPrimary = <SeriesInterface>{}
            allSeries.forEach((series: AudibleSeries) => {
                const seriesJson = getSeries(series)
                // Check and set primary series
                if (seriesJson && seriesJson.name === inputJson.publication_name!) {
                    seriesPrimary = seriesJson
                }
            })
            if (!seriesPrimary.name) return undefined
            return seriesPrimary
        }
        // Find secondary series if available
        const getSeriesSecondary = (allSeries: AudibleSeries[]) => {
            if (!allSeries) return undefined
            let seriesSecondary = <SeriesInterface>{}
            allSeries.forEach((series: AudibleSeries) => {
                const seriesJson = getSeries(series)
                // Check and set secondary series
                if (
                    allSeries.length > 1 &&
                    seriesJson &&
                    seriesJson.name !== inputJson.publication_name
                ) {
                    seriesSecondary = seriesJson
                }
            })
            if (!seriesSecondary.name) return undefined
            return seriesSecondary
        }
        const series1 = getSeriesPrimary(inputJson.series)
        const series2 = getSeriesSecondary(inputJson.series)

        const finalJson: ApiBookInterface = {
            asin: inputJson.asin,
            authors: inputJson.authors!.map((person: AuthorInterface) => {
                const authorJson = <AuthorInterface>{}

                // Use asin for author if available
                if (person.asin) {
                    authorJson.asin = person.asin
                }
                authorJson.name = person.name
                return authorJson
            }),
            description: htmlToText(inputJson['merchandising_summary'], {
                wordwrap: false
            }).trim(),
            formatType: inputJson.format_type,
            image: getHighResImage(),
            language: inputJson.language,
            ...(inputJson.narrators && {
                narrators: inputJson.narrators?.map((person: NarratorInterface) => {
                    const narratorJson = <NarratorInterface>{}
                    narratorJson.name = person.name
                    return narratorJson
                })
            }),
            publisherName: inputJson.publisher_name,
            ...(inputJson.rating && {
                rating: inputJson.rating.overall_distribution.display_average_rating.toString()
            }),
            releaseDate: getReleaseDate(),
            runtimeLengthMin: inputJson.runtime_length_min,
            ...(inputJson.series && {
                seriesPrimary: series1,
                ...(series2 && {
                    seriesSecondary: series2
                })
            }),
            ...(inputJson.subtitle && {
                subtitle: inputJson.subtitle
            }),
            summary: inputJson.publisher_summary,
            title: inputJson.title
        }

        return finalJson
    }
}

export default ApiHelper
