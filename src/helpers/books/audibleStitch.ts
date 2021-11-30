import { ApiBookInterface, BookInterface, HtmlBookInterface } from '../../interfaces/books/index'

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
    async includeGenres () {
        if (this.htmlRes && this.htmlRes.genres!.length) {
            this.tempJson.genres = this.htmlRes.genres
        }
    }

    /**
     * Call functions in the class to parse final JSON
     * @returns {Promise<BookInterface>}
     */
    async process (): Promise<BookInterface> {
        Promise.all([this.includeGenres()])
        this.bookJson = this.tempJson
        return this.bookJson
    }
}

export default StitchHelper
