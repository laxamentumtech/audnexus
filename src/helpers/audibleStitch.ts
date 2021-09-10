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

    includeGenres () {
        if (this.htmlRes && this.htmlRes.genres) {
            this.tempJson.genres = this.htmlRes.genres
        }
    }

    setSeriesOrder () {
        if (this.apiRes.publicationName) {
            if (this.htmlRes) {
                const htmlSeries = this.htmlRes.series

                // If multiple series, set one with primarySeries as primary
                if (htmlSeries) {
                    if (htmlSeries.length > 1) {
                        htmlSeries.forEach((item) => {
                            if (item.name === this.apiRes.publicationName) {
                                this.tempJson.primarySeries = item
                            } else {
                                this.tempJson.secondarySeries = item
                            }
                        })
                    } else {
                        this.tempJson.primarySeries = htmlSeries[0]
                    }
                }
            } else {
                this.tempJson.primarySeries = { name: this.tempJson.publicationName } as SeriesInterface
            }
            delete this.tempJson.publicationName
        }
    }

    process (): BookInterface {
        this.includeGenres()
        this.setSeriesOrder()
        // console.log(this.tempJson)
        this.bookJson = this.tempJson
        return this.bookJson
    }
}

export default StitchHelper
