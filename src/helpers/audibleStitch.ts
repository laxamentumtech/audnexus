import { ApiBookInterface, BookInterface, HtmlBookInterface, SeriesInterface } from '../interfaces/books/index'

class StitchHelper {
    apiRes: ApiBookInterface;
    htmlRes: HtmlBookInterface | undefined;
    tempJson: any;
    bookJson!: BookInterface;
    constructor (apiRes: ApiBookInterface) {
        this.apiRes = apiRes
        this.tempJson = apiRes
    }

    /**
     * Sets genres key in returned json if it exists
     */
    includeGenres () {
        if (this.htmlRes && this.htmlRes.genres!.length) {
            this.tempJson.genres = this.htmlRes.genres
        }
    }

    /**
     * Sets series' keys if they exist
     */
    setSeriesOrder () {
        if (this.apiRes.publicationName) {
            if (this.htmlRes) {
                const htmlSeries = this.htmlRes.series

                // If multiple series, set one with seriesPrimary as primary
                if (htmlSeries) {
                    if (htmlSeries.length > 1) {
                        htmlSeries.forEach((item) => {
                            if (item.name === this.apiRes.publicationName) {
                                this.tempJson.seriesPrimary = item
                            } else {
                                this.tempJson.seriesSecondary = item
                            }
                        })
                    } else {
                        this.tempJson.seriesPrimary = htmlSeries[0]
                    }
                }
            } else {
                this.tempJson.seriesPrimary = { name: this.tempJson.publicationName } as SeriesInterface
            }
            delete this.tempJson.publicationName
        }
    }

    /**
     * Call functions in the class to parse final JSON
     * @returns {BookInterface}
     */
    process (): BookInterface {
        this.includeGenres()
        this.setSeriesOrder()
        // console.log(this.tempJson)
        this.bookJson = this.tempJson
        return this.bookJson
    }
}

export default StitchHelper
