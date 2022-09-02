import { schema, types } from 'papr'

import papr from '#config/papr'

const bookSchema = schema(
	{
		asin: types.string({ required: true }),
		authors: types.array(
			types.object({
				asin: types.string(),
				name: types.string({ required: true })
			}),
			{ required: true }
		),
		description: types.string({ required: true }),
		formatType: types.string({ required: true }),
		genres: types.array(
			types.object({
				asin: types.string({ required: true }),
				name: types.string({ required: true }),
				type: types.string({ required: true })
			})
		),
		image: types.string(),
		language: types.string({ required: true }),
		narrators: types.array(
			types.object({
				asin: types.string(),
				name: types.string({ required: true })
			})
		),
		publisherName: types.string({ required: true }),
		rating: types.string({ required: true }),
		releaseDate: types.date({ required: true }),
		runtimeLengthMin: types.number({ required: true }),
		seriesPrimary: types.object({
			asin: types.string(),
			name: types.string({ required: true }),
			position: types.string()
		}),
		seriesSecondary: types.object({
			asin: types.string(),
			name: types.string({ required: true }),
			position: types.string()
		}),
		subtitle: types.string(),
		summary: types.string({ required: true }),
		title: types.string({ required: true })
	},
	{ timestamps: true }
)

export type BookDocument = typeof bookSchema[0]
const Book = papr.model('books', bookSchema)
export default Book
