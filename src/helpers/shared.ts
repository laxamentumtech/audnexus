class SharedHelper {
    /**
     * Creates URL to use in fetchBook
     * @param {string} ASIN The Audible ID to base the URL on
     * @returns {string} full url to fetch.
     */
    buildUrl (ASIN: string, baseDomain: string, baseUrl: string, params?: string): string {
        const argArr = [baseDomain, baseUrl, ASIN, params]
        const reqUrl = argArr.join('/')
        return reqUrl
    }

    /**
     * Checks asin length and format to verify it's valid
     * @param {string} asin 10 character identifier
     * @returns {boolean}
     */
    checkAsinValidity (asin: string): boolean {
        // First things first, check length
        if (asin.length !== 10) {
            return false
        }
        // Check ASIN structure
        const asinRegex = /(?=.\d)[A-Z\d]{10}/

        const match = asin.match(asinRegex)
        if (match) {
            return true
        }
        return false
    }
}

export default SharedHelper
