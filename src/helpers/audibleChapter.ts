import fetch from 'isomorphic-fetch'
import jsrsasign from 'jsrsasign'
import moment from 'moment'
import { ChapterInterface, SingleChapter } from '../interfaces/audible'
import { ApiChapterInterface, ApiSingleChapterInterface } from '../interfaces/books'

class ChapterHelper {
    asin: string;
    reqUrl: string;
    adpToken: string;
    privateKey: string;

    constructor (asin) {
        this.asin = asin
        this.reqUrl = this.buildUrl(asin)
        this.adpToken = process.env.ADP_TOKEN as string
        this.privateKey = process.env.PRIVATE_KEY as string
        this.privateKey = this.privateKey.replace(/\\n/g, '\n') as string
    }

    /**
     * Creates URL to use in fetchBook
     * @param {string} ASIN The Audible ID to base the URL on
     * @returns {string} full url to fetch.
     */
    buildUrl (ASIN: string): string {
        const baseDomain = 'https://api.audible.com'
        const baseUrl = '1.0/content'
        const params = 'metadata?response_groups=chapter_info'
        const reqUrl = `${baseDomain}/${baseUrl}/${ASIN}/${params}`
        return reqUrl
    }

    /**
     * Creates path string used by signRequest
     * @returns {string} concat path to be used by signRequest
     */
    buildPath (): string {
        const baseUrl = '1.0/content'
        const params = 'metadata?response_groups=chapter_info'
        const reqUrl = `/${baseUrl}/${this.asin}/${params}`
        return reqUrl
    }

    /**
     * Performs various checks on chapter names and cleans them up
     * @param {string} chapter
     * @returns {string} cleaned chapter
     */
    chapterTitleCleanup (chapter: string): string {
        // Starting chapter title data
        const originalTitle: string = chapter
        // Strip trailing periods
        const strippedTitle: string = originalTitle.replace(/\.$/, '')
        let chapterTitle: string
        // Check if title is just numbers
        if (!isNaN(Number(strippedTitle)) && strippedTitle.length < 3) {
            // Remove trailing period in some cases
            const stripPeriod: string = strippedTitle
            // Convert to number to normalize numbers
            const numTitle: number = parseInt(stripPeriod)
            // Convert back to string for concat
            const strTitle: string = numTitle.toString()
            chapterTitle = `Chapter ${strTitle}`
        } else {
            chapterTitle = originalTitle
        }

        return chapterTitle
    }

    /**
     * Creates the x-adp-signature header required to auth the API call
     * @param {string} adpToken from Audible-api auth file
     * @param {string} privateKey from Audible-api auth file
     * @returns {string} encoded 'x-adp-signature' header
     */
    signRequest (adpToken: string, privateKey: string): string {
        const method = 'GET'
        const path = this.buildPath()
        const body = ''
        const date = moment.utc().format()
        const data = `${method}\n${path}\n${date}\n${body}\n${adpToken}`
        const sig = new jsrsasign.KJUR.crypto.Signature({ alg: 'SHA256withRSA' })
        sig.init(privateKey)
        const hash = sig.signString(data)
        const signedEncoded = jsrsasign.hextob64(hash)

        const signedResponse: string = `${signedEncoded}:${date}`
        return signedResponse
    }

    /**
     * Fetches chapter Audible API JSON
     * @returns {Promise<ChapterInterface>} data from parseResponse() function.
     */
    async fetchBook (): Promise<ChapterInterface | undefined> {
        const response = await fetch(this.reqUrl, {
            headers: {
                'x-adp-token': this.adpToken,
                'x-adp-alg': 'SHA256withRSA:1.0',
                'x-adp-signature': this.signRequest(this.adpToken, this.privateKey)
            }
        })
        if (!response.ok) {
            const message = `An error has occured while fetching chapters ${response.status}`
            console.log(message)
            return undefined
        } else {
            const response = await fetch(this.reqUrl)
            const json: ChapterInterface = await response.json()
            return json
        }
    }

    /**
     * Pareses fetched chapters from Audible API and cleaning up chapter titles
     * @param {ChapterInterface} jsonRes fetched json response from api.audible.com
     * @returns {Promise<ApiChapterInterface>} relevant data to keep
     */
    async parseResponse (jsonRes: ChapterInterface | undefined): Promise<ApiChapterInterface | undefined> {
        // Base undefined check
        if (!jsonRes || !jsonRes.content_metadata.chapter_info) {
            return undefined
        }

        const inputJson = jsonRes.content_metadata.chapter_info
        const finalJson: any = {}

        let key: string
        let newKey: string
        const missingKeyMsg = (key: string) => {
            throw new Error(`Required key: ${key}, does not exist on: ${finalJson.asin}`)
        }
        const standardKeyHandling = (oldKey: string, newKey: string) => {
            if (oldKey in inputJson) {
                finalJson[newKey] = inputJson[oldKey]
            } else {
                missingKeyMsg(key)
            }
        }

        // Audible intro duration
        key = 'brandIntroDurationMs'
        newKey = key
        standardKeyHandling(key, newKey)

        // Audible outro duration
        key = 'brandOutroDurationMs'
        newKey = key
        standardKeyHandling(key, newKey)

        // Chapters
        key = 'chapters'
        if (key in inputJson) {
            const chapArr: ApiSingleChapterInterface[] = []
            // Loop through each person
            inputJson[key].forEach((chapter: SingleChapter) => {
                const chapJson = <ApiSingleChapterInterface>{}

                chapJson.lengthMs = chapter.length_ms
                chapJson.startOffsetMs = chapter.start_offset_ms
                chapJson.startffsetSec = chapter.start_offset_sec
                chapJson.title = this.chapterTitleCleanup(chapter.title)

                chapArr.push(chapJson)
            })
            // Use final array as value
            finalJson[key] = chapArr
        } else {
            missingKeyMsg(key)
        }

        // Are chapter times accurate
        key = 'is_accurate'
        newKey = 'isAccurate'
        standardKeyHandling(key, newKey)

        // Runtime in milliseconds
        key = 'runtime_length_ms'
        newKey = 'runtimeLengthMs'
        standardKeyHandling(key, newKey)

        // Runtime in seconds
        key = 'runtime_length_sec'
        newKey = 'runtimeLengthSec'
        standardKeyHandling(key, newKey)

        return finalJson
    }
}

export default ChapterHelper
