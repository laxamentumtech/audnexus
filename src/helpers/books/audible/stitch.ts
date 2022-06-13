import { ApiBookInterface, BookInterface, HtmlBookInterface } from '#interfaces/books/index'

class StitchHelper {
    apiRes: ApiBookInterface
    htmlRes: HtmlBookInterface | undefined
    tempJson: Partial<BookInterface>
    constructor(apiRes: ApiBookInterface) {
        this.apiRes = apiRes
        this.tempJson = apiRes
    }

    /**
     * Sets genres key in returned json if it exists
     */
    async includeGenres(): Promise<BookInterface> {
        if (this.htmlRes && this.htmlRes.genres!.length) {
            this.tempJson.genres = this.htmlRes.genres
        }
        return this.tempJson as BookInterface
    }

    /**
     * Call functions in the class to parse final JSON
     * @returns {Promise<BookInterface>}
     */
    async process(): Promise<BookInterface> {
        const stitchedGenres = await this.includeGenres()
        const bookJson: BookInterface = stitchedGenres
        return bookJson
    }
}

export default StitchHelper
