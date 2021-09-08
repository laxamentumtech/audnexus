class sharedHelper {
    checkAsinValidity (asin: string) {
        const asinRegex = /[0-9A-Z]{10}/gm

        const match = asin.match(asinRegex)
        if (match) {
            return true
        }
        return false
    }
}

export default sharedHelper
