import { ApiBookInterface, BookInterface, HtmlBookInterface } from '../interfaces/books/index'

class StitchHelper {
    apiRes: ApiBookInterface;
    htmlRes: HtmlBookInterface;
    tempJson: any;
    bookJson!: BookInterface;
    constructor (apiRes: ApiBookInterface, htmlRes: HtmlBookInterface) {
        this.apiRes = apiRes
        this.htmlRes = htmlRes
        this.tempJson = apiRes
    }

    includeGenres () {
        if (this.htmlRes.genres) {
            this.tempJson.genres = this.htmlRes.genres
        }
    }

    setSeriesOrder () {
        if (this.apiRes.publicationName) {
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
                delete this.tempJson.publicationName
            }
        }
    }

    process (): BookInterface {
        this.includeGenres()
        this.setSeriesOrder()
        console.log(this.tempJson)
        this.bookJson = this.tempJson
        return this.bookJson
    }
}

export default StitchHelper
