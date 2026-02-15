import { AsinSchema, GenreAsinSchema, NameSchema, RegionSchema, TitleSchema } from '#config/types'

describe('schemas should', () => {
	test('validate ASINs', () => {
		expect(AsinSchema.safeParse('B079LRSMNN').success).toBe(true)
		expect(AsinSchema.safeParse('12345678910').success).toBe(false)
		expect(AsinSchema.safeParse('B*79LRSMNN').success).toBe(false)
		expect(AsinSchema.safeParse('20XORININE').success).toBe(false)
		expect(AsinSchema.safeParse('1705047572').success).toBe(true)
		expect(AsinSchema.safeParse('B07Q769RZS').success).toBe(true)
		expect(AsinSchema.safeParse('B0B9YP4F9P').success).toBe(true)
	})

	test('validate ASINs with 11 characters', () => {
		expect(GenreAsinSchema.safeParse('18574784011').success).toBe(true)
		expect(GenreAsinSchema.safeParse('123456789011').success).toBe(true)
		expect(GenreAsinSchema.safeParse('B*79LRSMNN1').success).toBe(false)
		expect(GenreAsinSchema.safeParse('20XORININE1').success).toBe(false)
		expect(GenreAsinSchema.safeParse('17050475721').success).toBe(true)
		expect(GenreAsinSchema.safeParse('18574800011').success).toBe(true)
		expect(GenreAsinSchema.safeParse('18574809011').success).toBe(true)
	})

	test('validate region', () => {
		expect(RegionSchema.safeParse('au').success).toBe(true)
		expect(RegionSchema.safeParse('ca').success).toBe(true)
		expect(RegionSchema.safeParse('de').success).toBe(true)
		expect(RegionSchema.safeParse('es').success).toBe(true)
		expect(RegionSchema.safeParse('fr').success).toBe(true)
		expect(RegionSchema.safeParse('in').success).toBe(true)
		expect(RegionSchema.safeParse('it').success).toBe(true)
		expect(RegionSchema.safeParse('jp').success).toBe(true)
		expect(RegionSchema.safeParse('uk').success).toBe(true)
		expect(RegionSchema.safeParse('us').success).toBe(true)
		expect(RegionSchema.safeParse('mx').success).toBe(false)
		expect(RegionSchema.safeParse('br').success).toBe(false)
		expect(RegionSchema.safeParse('cn').success).toBe(false)
		expect(RegionSchema.safeParse('ru').success).toBe(false)
		expect(RegionSchema.safeParse('sa').success).toBe(false)
		expect(RegionSchema.safeParse('za').success).toBe(false)
		expect(RegionSchema.safeParse('alskdjlak;sjfl;kas').success).toBe(false)
	})

	test('validate name', () => {
		expect(NameSchema.safeParse('John Doe').success).toBe(true)
		expect(NameSchema.safeParse('John').success).toBe(true)
		expect(NameSchema.safeParse('Doe').success).toBe(true)
		expect(NameSchema.safeParse('Jo').success).toBe(true)
		expect(NameSchema.safeParse('D').success).toBe(false)
		expect(NameSchema.safeParse('').success).toBe(false)
	})

	test('validate title', () => {
		expect(TitleSchema.safeParse('Chapter 1').success).toBe(true)
		expect(TitleSchema.safeParse('Ch 1').success).toBe(true)
		expect(TitleSchema.safeParse('2nd').success).toBe(true)
		expect(TitleSchema.safeParse('1').success).toBe(true)
		expect(TitleSchema.safeParse('').success).toBe(false)
	})
})
