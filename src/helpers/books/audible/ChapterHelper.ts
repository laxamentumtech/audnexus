import jsrsasign from 'jsrsasign'
import moment from 'moment'

import { AudibleChapter, SingleChapter } from '#config/typing/audible'
import { ApiChapter, ApiSingleChapter } from '#config/typing/books'
import fetch from '#helpers/utils/fetchPlus'
import SharedHelper from '#helpers/utils/shared'

class ChapterHelper {
	asin: string
	reqUrl: string
	adpToken: string
	privateKey: string

	constructor(asin: string) {
		this.asin = asin
		const helper = new SharedHelper()
		const baseDomain = 'https://api.audible.com'
		const baseUrl = '1.0/content'
		const params = 'metadata?response_groups=chapter_info'
		this.reqUrl = helper.buildUrl(asin, baseDomain, baseUrl, params)
		if (process.env.ADP_TOKEN && process.env.PRIVATE_KEY) {
			this.adpToken = process.env.ADP_TOKEN
			this.privateKey = process.env.PRIVATE_KEY
			this.privateKey = this.privateKey.replace(/\\n/g, '\n')
		} else {
			throw new Error('Missing environment vars for chapters')
		}
	}

	/**
	 * Creates path string used by signRequest
	 * @returns {string} concat path to be used by signRequest
	 */
	buildPath(): string {
		const baseUrl = '1.0/content'
		const params = 'metadata?response_groups=chapter_info'
		return `/${baseUrl}/${this.asin}/${params}`
	}

	/**
	 * Performs various checks on chapter names and cleans them up
	 * @param {string} chapter
	 * @returns {string} cleaned chapter
	 */
	chapterTitleCleanup(chapter: string): string {
		// Starting chapter title data
		const originalTitle: string = chapter
		// Strip trailing periods
		const strippedTitle: string = originalTitle.replace(/\.$/, '')
		let chapterTitle = strippedTitle
		// Check if title is just numbers
		const isNotNumber = isNaN(Number(strippedTitle))
		if (!isNotNumber && strippedTitle.length <= 3) {
			// Remove trailing period in some cases
			const stripPeriod: string = strippedTitle
			// Convert to number to normalize numbers
			const numTitle: number = parseInt(stripPeriod)
			// Convert back to string for concat
			const strTitle: string = numTitle.toString()
			chapterTitle = `Chapter ${strTitle}`
		}

		return chapterTitle
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
		return fetch(this.reqUrl, {
			headers: {
				'x-adp-token': this.adpToken,
				'x-adp-alg': 'SHA256withRSA:1.0',
				'x-adp-signature': this.signRequest(this.adpToken, this.privateKey)
			}
		})
			.then(async (response) => {
				const json: AudibleChapter = await response.json()
				return json
			})
			.catch((error) => {
				const message = `An error has occured while fetching chapters ${error.status}: ${this.reqUrl}`
				console.log(message)
				return undefined
			})
	}

	/**
	 * Pareses fetched chapters from Audible API and cleaning up chapter titles
	 * @param {AudibleChapter} jsonRes fetched json response from api.audible.com
	 * @returns {Promise<ApiChapter>} relevant data to keep
	 */
	async parseResponse(jsonRes: AudibleChapter | undefined): Promise<ApiChapter | undefined> {
		// Base undefined check
		if (!jsonRes || !jsonRes.content_metadata.chapter_info) {
			return undefined
		}
		const inputJson = jsonRes.content_metadata.chapter_info

		// Check all required keys present
		const requiredKeys = [
			'brandIntroDurationMs',
			'brandOutroDurationMs',
			'chapters',
			'is_accurate',
			'runtime_length_ms',
			'runtime_length_sec'
		]

		requiredKeys.forEach((key) => {
			if (!Object.prototype.hasOwnProperty.call(inputJson, key)) {
				throw new Error(`Required key: ${key}, does not exist on: ${this.asin}`)
			}
		})

		const finalJson: ApiChapter = {
			asin: this.asin,
			brandIntroDurationMs: inputJson.brandIntroDurationMs,
			brandOutroDurationMs: inputJson.brandOutroDurationMs,
			chapters: inputJson.chapters.map((chapter: SingleChapter) => {
				const chapJson: ApiSingleChapter = {
					lengthMs: chapter.length_ms,
					startOffsetMs: chapter.start_offset_ms,
					startOffsetSec: chapter.start_offset_sec,
					title: this.chapterTitleCleanup(chapter.title)
				}
				return chapJson
			}),
			isAccurate: inputJson.is_accurate,
			runtimeLengthMs: inputJson.runtime_length_ms,
			runtimeLengthSec: inputJson.runtime_length_sec
		}

		return finalJson
	}

	/**
	 * Call functions in the class to parse final book JSON
	 * @returns {Promise<ApiChapter>}
	 */
	async process(): Promise<ApiChapter | undefined> {
		const chapterResponse = await this.fetchChapter()

		return this.parseResponse(chapterResponse)
	}
}

export default ChapterHelper
