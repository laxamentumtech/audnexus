import cleanupDescription from '#helpers/utils/cleanupDescription'
import { parsedAuthor } from '#tests/datasets/helpers/authors'
import { parsedBook } from '#tests/datasets/helpers/books'

const badInput = `
"Matthew Iden is the author of the psychological suspense novel The Winter Over, a half-dozen books in the Marty Singer detective series, and several acclaimed stand-alone novels. His eclectic work resume includes jobs with the US Postal Service, an international nonprofit, the Forest Service in Sitka, Alaska, and the globe-spanning Semester at Sea program. His latest, Birthday Girl, is a suspense novel featuring Elliott Nash, a former forensic psychologist who is now homeless but is recruited to save a young girl from a serial kidnapper (March 2018). Get in touch via e-mail at matt.iden@matthew-iden.com, Facebook at www.facebook.com/matthew.iden, Twitter @CrimeRighter, or visit www.matthew-iden.com for information on upcoming appearances, new releases, and to receive a free copy of the Marty Singer short story "The Guardian"--not available anywhere else."`

const badAuthorInput = parsedAuthor.description as string

const goodInput = parsedBook.description as string

describe('cleanupDescription should', () => {
	test('remove emails', () => {
		const result = cleanupDescription(badInput)
		expect(result).not.toContain('matt.iden@matthew-iden.com')
	})

	test('remove twitter handles', () => {
		const result = cleanupDescription(badInput)
		expect(result).not.toContain('@CrimeRighter')
	})

	test('remove urls', () => {
		const result = cleanupDescription(badInput)
		expect(result).not.toContain('www.facebook.com/matthew.iden')

		const result2 = cleanupDescription(badAuthorInput)
		expect(result2).not.toContain('www.JasonAnspach.com')
		expect(result2).not.toContain('www.InTheLegion.com')
		expect(result2).not.toContain('facebook.com/authorjasonanspach')
		expect(result2).not.toContain('twitter.com/TheJasonAnspach')
	})

	test('not remove any text from a good input', () => {
		const result = cleanupDescription(goodInput)
		expect(result).toEqual(goodInput)
	})
})
