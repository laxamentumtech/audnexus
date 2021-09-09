class SharedHelper {
    checkAsinValidity (asin: string): boolean {
        const asinRegex = /[0-9A-Z]{10}/gm

        const match = asin.match(asinRegex)
        if (match) {
            return true
        }
        return false
    }
}

export default SharedHelper
