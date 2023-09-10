import { schema, types } from 'papr'

import papr from '#config/papr'
import { regionRegex, regions } from '#static/regions'

const chapterSchema = schema(
	{
		asin: types.string({ required: true }),
		brandIntroDurationMs: types.number({ required: true }),
		brandOutroDurationMs: types.number({ required: true }),
		chapters: types.array(
			types.object({
				lengthMs: types.number({ required: true }),
				startOffsetMs: types.number({ required: true }),
				startOffsetSec: types.number({ required: true }),
				title: types.string({ required: true })
			}),
			{ required: true }
		),
		isAccurate: types.boolean({ required: true }),
		region: types.string({
			enum: Object.keys(regions),
			pattern: regionRegex,
			required: true
		}),
		runtimeLengthMs: types.number({ required: true }),
		runtimeLengthSec: types.number({ required: true })
	},
	{
		defaults: {
			region: 'us'
		},
		timestamps: true
	}
)

export type ChapterDocument = (typeof chapterSchema)[0]
const Chapter = papr.model('chapters', chapterSchema)
export default Chapter
