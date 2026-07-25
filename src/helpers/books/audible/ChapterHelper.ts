import type { FastifyBaseLogger } from 'fastify'
import jsrsasign from 'jsrsasign'
import moment from 'moment'

import {
	ApiChapter,
	ApiChapterSchema,
	ApiSingleChapter,
	AudibleChapter,
	AudibleChapterSchema,
	AudibleSingleChapter
} from '#config/types'
import { ContentTypeMismatchError, NotFoundError } from '#helpers/errors/ApiErrors'
import fetch from '#helpers/utils/fetchPlus'
import SharedHelper from '#helpers/utils/shared'
import {
	ErrorMessageContentTypeMismatch,
	ErrorMessageHTTPFetch,
	ErrorMessageMissingEnv,
	ErrorMessageNoData,
	ErrorMessageRegion,
	ErrorMessageRequiredKey
} from '#static/messages'
import { regions } from '#static/regions'

class ChapterHelper {
	adpToken: string
	asin: string
	audibleResponse: AudibleChapter['content_metadata']['chapter_info'] | undefined
	privateKey: string
	region: string
	requestUrl: string
	logger?: FastifyBaseLogger

	constructor(asin: string, region: string, logger?: FastifyBaseLogger) {
		this.asin = asin
		this.region = region
		this.logger = logger
		const helper = new SharedHelper()
		const baseDomain = 'https://api.audible'
		const regionTLD = regions[region].tld
		const baseUrl = '1.0/content'
		const params = 'response_groups=chapter_info&quality=High'
		this.requestUrl = helper.buildUrl(asin + '/metadata', baseDomain, regionTLD, baseUrl, params)
		if (process.env.ADP_TOKEN && process.env.PRIVATE_KEY) {
			this.adpToken = process.env.ADP_TOKEN
			this.privateKey = process.env.PRIVATE_KEY
			this.privateKey = this.privateKey.replace(/\\n/g, '\n')
		} else {
			throw new Error(ErrorMessageMissingEnv('ADP_TOKEN or PRIVATE_KEY'))
		}
	}

	/**
	 * Performs various checks on chapter names and cleans them up
	 * @param {string} chapter
	 * @returns {string} cleaned chapter
	 */
	chapterTitleCleanup(chapter: string): string {
		const chapterNameLocale = regions[this.region].strings.chapterName
		// Starting chapter title data
		const originalTitle: string = chapter
		// Strip trailing periods
		const strippedTitle: string = originalTitle.replace(/\.$/, '')
		let chapterTitle = strippedTitle
		// Check if title is just numbers
		const isNotNumber = isNaN(Number(strippedTitle))
		// Check if title has an underscore between Chapter and number
		const hasUnderscore = strippedTitle.includes('_')
		if (!isNotNumber && strippedTitle.length <= 3) {
			// Remove trailing period in some cases
			const stripPeriod: string = strippedTitle
			// Convert to number to normalize numbers
			const numTitle: number = parseInt(stripPeriod)
			// Convert back to string for concat
			const strTitle: string = numTitle.toString()
			chapterTitle = `${chapterNameLocale} ${strTitle}`
		} else if (hasUnderscore) {
			const splitTitle = strippedTitle.split('_')
			const numTitle = splitTitle[1]
			chapterTitle = `${chapterNameLocale} ${numTitle}`
		}

		return chapterTitle
	}

	/**
	 * Validates that the content type is a valid book type
	 * @param {string | undefined} contentType the content delivery type from the book
	 * @throws {ContentTypeMismatchError} if content type is not a valid book type
	 */
	validateContentType(contentType: string | undefined): void {
		const validBookTypes = ['MultiPartBook', 'SinglePartBook']

		if (!contentType || !validBookTypes.includes(contentType)) {
			const actualType = contentType || 'unknown'
			throw new ContentTypeMismatchError(
				ErrorMessageContentTypeMismatch(this.asin, actualType, 'book'),
				{ asin: this.asin, requestedType: 'book', actualType }
			)
		}
	}

	/**
	 * Creates path string used by signRequest
	 * @returns {string} concat path to be used by signRequest
	 */
	buildPath(): string {
		const baseUrl = '1.0/content'
		const params = 'metadata?response_groups=chapter_info&quality=High'
		return `/${baseUrl}/${this.asin}/${params}`
	}

	/**
	 * Creates the x-adp-signature header required to auth the API call
	 * @param {string} adpToken from Audible-api auth file
	 * @param {string} privateKey from Audible-api auth file
	 * @returns {string} encoded 'x-adp-signature' header
	 */
	signRequest(adpToken: string, privateKey: string): string {
		const method = 'GET'
		const path = this.buildPath()
		const body = ''
		const date = moment.utc().format()
		const data = `${method}\n${path}\n${date}\n${body}\n${adpToken}`
		const sig = new jsrsasign.KJUR.crypto.Signature({ alg: 'SHA256withRSA' })
		sig.init(privateKey)
		const hash = sig.signString(data)
		const signedEncoded = jsrsasign.hextob64(hash)

		return `${signedEncoded}:${date}`
	}

	/**
	 * Fetches chapter Audible API JSON
	 * @returns {Promise<AudibleChapter>} data from parseResponse() function.
	 */
	async fetchChapter(): Promise<AudibleChapter | undefined> {
		return fetch(this.requestUrl, {
			headers: {
				'x-adp-token': this.adpToken,
				'x-adp-alg': 'SHA256withRSA:1.0',
				'x-adp-signature': this.signRequest(this.adpToken, this.privateKey)
			}
		})
			.then(async (response) => {
				const json: AudibleChapter = response.data
				return json
			})
			.catch((error) => {
				this.logger?.error(ErrorMessageHTTPFetch(this.asin, error.status, 'chapters'))
				return undefined
			})
	}

	/**
	 * Compile the final data object.
	 * This is run after all other data has been parsed.
	 */
	getFinalData(): ApiChapter {
		if (!this.audibleResponse) throw new Error(ErrorMessageNoData(this.asin, 'ChapterHelper'))

		return ApiChapterSchema.parse({
			asin: this.asin,
			brandIntroDurationMs: this.audibleResponse.brandIntroDurationMs,
			brandOutroDurationMs: this.audibleResponse.brandOutroDurationMs,
			chapters: this.audibleResponse.chapters.map((chapter: AudibleSingleChapter) => {
				const chapJson: ApiSingleChapter = {
					lengthMs: chapter.length_ms,
					startOffsetMs: chapter.start_offset_ms,
					startOffsetSec: chapter.start_offset_sec,
					title: this.chapterTitleCleanup(chapter.title)
				}
				return chapJson
			}),
			isAccurate: this.audibleResponse.is_accurate,
			region: this.region,
			runtimeLengthMs: this.audibleResponse.runtime_length_ms,
			runtimeLengthSec: this.audibleResponse.runtime_length_sec
		})
	}

	/**
	 * Pareses fetched chapters from Audible API and cleaning up chapter titles
	 * @param {AudibleChapter} jsonResponse fetched json response from api.audible.com
	 * @returns {Promise<ApiChapter>} relevant data to keep
	 */
	async parseResponse(jsonResponse: AudibleChapter | undefined): Promise<ApiChapter | undefined> {
		// Base undefined check - chapter data not available in this region
		if (!jsonResponse?.content_metadata.chapter_info) {
			throw new NotFoundError(ErrorMessageRegion(this.asin, this.region), {
				asin: this.asin,
				code: 'REGION_UNAVAILABLE'
			})
		}

		// Parse response with zod
		const response = AudibleChapterSchema.safeParse(jsonResponse)
		// Handle error if response is not valid
		if (!response.success) {
			// Get the key 'path' from the first issue
			const issuesPath = response.error.issues[0].path
			// Get the last key from the path, which is the key that is missing
			const key = issuesPath[issuesPath.length - 1]
			// Throw error with the missing key
			throw new Error(ErrorMessageRequiredKey(this.asin, String(key), 'exist for chapter'))
		}

		// Set response to class variable on success
		this.audibleResponse = response.data.content_metadata.chapter_info

		return this.getFinalData()
	}

	/**
	 * Call functions in the class to parse final book JSON
	 * @param {string} [contentType] optional content delivery type to validate before fetching chapters
	 * @returns {Promise<ApiChapter>}
	 */
	async process(contentType?: string): Promise<ApiChapter | undefined> {
		// Validate content type if provided
		if (contentType) {
			this.validateContentType(contentType)
		}

		const chapterResponse = await this.fetchChapter()

		return this.parseResponse(chapterResponse)
	}
}

export default ChapterHelper
