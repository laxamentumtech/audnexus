import { schema, types } from 'papr'

import papr from '#config/papr'
import { regionRegex, regions } from '#static/regions'

const authorSchema = schema(
	{
		aliases: types.array(types.string({ required: true })),
		asin: types.string({ required: true }),
		birthDate: types.date(),
		books: types.array(types.objectId()),
		description: types.string(),
		genres: types.array(
			types.object({
				asin: types.string({ required: true }),
				name: types.string({ required: true }),
				type: types.string({ required: true })
			})
		),
		image: types.string(),
		links: types.array(
			types.object({
				link: types.string({ required: true }),
				type: types.string({ required: true })
			})
		),
		location: types.string(),
		name: types.string({ required: true }),
		region: types.string({
			enum: Object.keys(regions),
			pattern: regionRegex,
			required: true
		}),
		series: types.array(types.objectId()),
		similar: types.array(
			types.object({
				asin: types.string(),
				name: types.string({ required: true })
			})
		)
	},
	{
		defaults: {
			region: 'us'
		},
		timestamps: true
	}
)

export type AuthorDocument = (typeof authorSchema)[0]
const Author = papr.model('authors', authorSchema)
export default Author
