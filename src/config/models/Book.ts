import { schema, types } from 'papr'

import papr from '#config/papr'
import { regionRegex, regions } from '#static/regions'

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
		copyright: types.number(),
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
		isAdult: types.boolean({ required: true }),
		isbn: types.string(),
		language: types.string({ required: true }),
		literatureType: types.string({ enum: ['fiction', 'nonfiction'] }),
		narrators: types.array(
			types.object({
				asin: types.string(),
				name: types.string({ required: true })
			})
		),
		publisherName: types.string({ required: true }),
		rating: types.string({ required: true }),
		region: types.string({
			enum: Object.keys(regions),
			pattern: regionRegex,
			required: true
		}),
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
	{
		defaults: {
			isAdult: false,
			isbn: '',
			region: 'us'
		},
		timestamps: true
	}
)

export type BookDocument = (typeof bookSchema)[0]
const Book = papr.model('books', bookSchema)
export default Book
