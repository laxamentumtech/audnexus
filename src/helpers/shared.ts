import lodash from 'lodash'

import { AuthorDocument } from '#config/models/Author'
import { BookDocument } from '#config/models/Book'
import { ChapterDocument } from '#config/models/Chapter'
import { ApiChapter, Book } from '#config/typing/books'
import { AuthorProfile } from '#config/typing/people'

class SharedHelper {
	asin10Regex = /(?=.\d)[A-Z\d]{10}/
	asin11Regex = /(?=.\d)[A-Z\d]{11}/
	/**
	 * Creates URL to use in fetchBook
	 * @param {string} ASIN The Audible ID to base the URL on
	 * @returns {string} full url to fetch.
	 */
	buildUrl(ASIN: string, baseDomain: string, baseUrl: string, params?: string): string {
		const argArr = [baseDomain, baseUrl, ASIN, params]
		const reqUrl = argArr.join('/')
		return reqUrl
	}

	/**
	 * Checks asin length and format to verify it's valid
	 * @param {string} asin 10 character identifier
	 * @returns {boolean}
	 */
	checkAsinValidity(asin: string): boolean {
		// First things first, check length
		if (asin.length !== 10) {
			return false
		}

		if (asin.match(this.asin10Regex)) {
			return true
		}
		return false
	}

	/**
	 * Checks whether the input data are identical
	 * @param {AuthorProfile | Book | ApiChapter} original
	 * @param {AuthorProfile | Book | ApiChapter} updated
	 * @returns {boolean}
	 */
	checkDataEquality(
		original: AuthorProfile | Book | ApiChapter,
		updated: AuthorProfile | Book | ApiChapter
	): boolean {
		if (lodash.isEqual(original, updated)) {
			return true
		}
		return false
	}

	/**
	 * Checks if the object was updated in the last 24 hours
	 * @param obj object to check
	 * @returns {boolean} true if updated in last 24 hours, false otherwise
	 */
	checkIfRecentlyUpdated(obj: AuthorDocument | BookDocument | ChapterDocument): boolean {
		const now = new Date()
		const lastUpdated = new Date(obj.updatedAt)
		const diff = now.getTime() - lastUpdated.getTime()
		const diffDays = diff / (1000 * 3600 * 24)
		if (diffDays < 1) {
			return true
		}
		return false
	}

	/**
	 * Regex to return just the ASIN from the given URL
	 * @param {string} url string to extract ASIN from
	 * @returns {string} ASIN.
	 */
	getGenreAsinFromUrl(url: string): string | undefined {
		return url.match(this.asin11Regex)?.[0]
	}
}

export default SharedHelper
