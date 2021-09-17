class SharedHelper {
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
        const asinRegex = /[0-9A-Z]{10}/gm

        const match = asin.match(asinRegex)
        if (match) {
            return true
        }
        return false
    }
}

export default SharedHelper
