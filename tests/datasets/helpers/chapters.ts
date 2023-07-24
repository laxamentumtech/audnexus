import { ObjectId, WithId } from 'mongodb'

import { ChapterDocument } from '#config/models/Chapter'
import type { ApiChapter, AudibleChapter } from '#config/types'

const _id = new ObjectId('5c8f8f8f8f8f8f8f8f8f8f8f')

export const apiChapters: AudibleChapter = {
	content_metadata: {
		chapter_info: {
			brandIntroDurationMs: 2043,
			brandOutroDurationMs: 5062,
			chapters: [
				{ length_ms: 21073, start_offset_ms: 0, start_offset_sec: 0, title: 'Legionnaire' },
				{ length_ms: 1591, start_offset_ms: 21073, start_offset_sec: 21, title: 'Part One' },
				{ length_ms: 945561, start_offset_ms: 22664, start_offset_sec: 23, title: '1' },
				{ length_ms: 1198150, start_offset_ms: 968225, start_offset_sec: 968, title: '2' },
				{ length_ms: 843488, start_offset_ms: 2166375, start_offset_sec: 2166, title: '3' },
				{ length_ms: 868287, start_offset_ms: 3009863, start_offset_sec: 3010, title: '4' },
				{ length_ms: 973845, start_offset_ms: 3878150, start_offset_sec: 3878, title: '5' },
				{ length_ms: 1257964, start_offset_ms: 4851995, start_offset_sec: 4852, title: '6' },
				{ length_ms: 1150549, start_offset_ms: 6109959, start_offset_sec: 6110, title: '7' },
				{ length_ms: 793844, start_offset_ms: 7260508, start_offset_sec: 7261, title: '8' },
				{ length_ms: 1101183, start_offset_ms: 8054352, start_offset_sec: 8054, title: '9' },
				{ length_ms: 1169310, start_offset_ms: 9155535, start_offset_sec: 9156, title: '10' },
				{ length_ms: 990610, start_offset_ms: 10324845, start_offset_sec: 10325, title: '11' },
				{ length_ms: 500, start_offset_ms: 11315455, start_offset_sec: 11315, title: 'Camp Forge' },
				{ length_ms: 582553, start_offset_ms: 11315955, start_offset_sec: 11316, title: '12' },
				{ length_ms: 3504, start_offset_ms: 11898508, start_offset_sec: 11899, title: 'Part Two' },
				{ length_ms: 1007168, start_offset_ms: 11902012, start_offset_sec: 11902, title: '13' },
				{ length_ms: 927359, start_offset_ms: 12909180, start_offset_sec: 12909, title: '14' },
				{ length_ms: 1053164, start_offset_ms: 13836539, start_offset_sec: 13837, title: '15' },
				{ length_ms: 775825, start_offset_ms: 14889703, start_offset_sec: 14890, title: '16' },
				{ length_ms: 868566, start_offset_ms: 15665528, start_offset_sec: 15666, title: '17' },
				{ length_ms: 1087158, start_offset_ms: 16534094, start_offset_sec: 16534, title: '18' },
				{ length_ms: 1085719, start_offset_ms: 17621252, start_offset_sec: 17621, title: '19' },
				{ length_ms: 784881, start_offset_ms: 18706971, start_offset_sec: 18707, title: '20' },
				{ length_ms: 1570644, start_offset_ms: 19491852, start_offset_sec: 19492, title: '21' },
				{ length_ms: 1286803, start_offset_ms: 21062496, start_offset_sec: 21062, title: '22' },
				{ length_ms: 856166, start_offset_ms: 22349299, start_offset_sec: 22349, title: '23' },
				{
					length_ms: 2788252,
					start_offset_ms: 23205465,
					start_offset_sec: 23205,
					title: 'Epilogue'
				},
				{
					length_ms: 618672,
					start_offset_ms: 25993717,
					start_offset_sec: 25994,
					title: 'Galactic Outlaws'
				},
				{ length_ms: 1142375, start_offset_ms: 26612389, start_offset_sec: 26612, title: '1' },
				{ length_ms: 880547, start_offset_ms: 27754764, start_offset_sec: 27755, title: '2' },
				{ length_ms: 1227175, start_offset_ms: 28635311, start_offset_sec: 28635, title: '3' },
				{ length_ms: 541814, start_offset_ms: 29862486, start_offset_sec: 29862, title: '4' },
				{ length_ms: 589880, start_offset_ms: 30404300, start_offset_sec: 30404, title: '5' },
				{ length_ms: 1030316, start_offset_ms: 30994180, start_offset_sec: 30994, title: '6' },
				{ length_ms: 1358600, start_offset_ms: 32024496, start_offset_sec: 32024, title: '7' },
				{ length_ms: 1502099, start_offset_ms: 33383096, start_offset_sec: 33383, title: '8' },
				{ length_ms: 1581883, start_offset_ms: 34885195, start_offset_sec: 34885, title: '9' },
				{ length_ms: 1139264, start_offset_ms: 36467078, start_offset_sec: 36467, title: '10' },
				{ length_ms: 1295999, start_offset_ms: 37606342, start_offset_sec: 37606, title: '11' },
				{ length_ms: 1341556, start_offset_ms: 38902341, start_offset_sec: 38902, title: '12' },
				{ length_ms: 1233537, start_offset_ms: 40243897, start_offset_sec: 40244, title: '13' },
				{ length_ms: 982715, start_offset_ms: 41477434, start_offset_sec: 41477, title: '14' },
				{ length_ms: 2074424, start_offset_ms: 42460149, start_offset_sec: 42460, title: '15' },
				{ length_ms: 1307191, start_offset_ms: 44534573, start_offset_sec: 44535, title: '16' },
				{ length_ms: 1750413, start_offset_ms: 45841764, start_offset_sec: 45842, title: '17' },
				{ length_ms: 1449993, start_offset_ms: 47592177, start_offset_sec: 47592, title: '18' },
				{ length_ms: 1149899, start_offset_ms: 49042170, start_offset_sec: 49042, title: '19' },
				{ length_ms: 1361200, start_offset_ms: 50192069, start_offset_sec: 50192, title: '20' },
				{ length_ms: 1272546, start_offset_ms: 51553269, start_offset_sec: 51553, title: '21' },
				{ length_ms: 1227314, start_offset_ms: 52825815, start_offset_sec: 52826, title: '22' },
				{ length_ms: 1570551, start_offset_ms: 54053129, start_offset_sec: 54053, title: '23' },
				{ length_ms: 966043, start_offset_ms: 55623680, start_offset_sec: 55624, title: '24' },
				{ length_ms: 883751, start_offset_ms: 56589723, start_offset_sec: 56590, title: '25' },
				{ length_ms: 843999, start_offset_ms: 57473474, start_offset_sec: 57473, title: '26' },
				{ length_ms: 926569, start_offset_ms: 58317473, start_offset_sec: 58317, title: '27' },
				{ length_ms: 696784, start_offset_ms: 59244042, start_offset_sec: 59244, title: '28' },
				{ length_ms: 594988, start_offset_ms: 59940826, start_offset_sec: 59941, title: '29' },
				{ length_ms: 417495, start_offset_ms: 60535814, start_offset_sec: 60536, title: '30' },
				{ length_ms: 1469356, start_offset_ms: 60953309, start_offset_sec: 60953, title: '31' },
				{ length_ms: 89614, start_offset_ms: 62422665, start_offset_sec: 62423, title: 'Epilogue' },
				{
					length_ms: 35730,
					start_offset_ms: 62512279,
					start_offset_sec: 62512,
					title: 'End Credits'
				}
			],
			is_accurate: true,
			runtime_length_ms: 62548009,
			runtime_length_sec: 62548
		}
	},
	response_groups: ['always-returned', 'chapter_info']
}

export const parsedChapters: ApiChapter = {
	asin: 'B079LRSMNN',
	brandIntroDurationMs: 2043,
	brandOutroDurationMs: 5062,
	chapters: [
		{
			lengthMs: 21073,
			startOffsetMs: 0,
			startOffsetSec: 0,
			title: 'Legionnaire'
		},
		{
			lengthMs: 1591,
			startOffsetMs: 21073,
			startOffsetSec: 21,
			title: 'Part One'
		},
		{
			lengthMs: 945561,
			startOffsetMs: 22664,
			startOffsetSec: 23,
			title: 'Chapter 1'
		},
		{
			lengthMs: 1198150,
			startOffsetMs: 968225,
			startOffsetSec: 968,
			title: 'Chapter 2'
		},
		{
			lengthMs: 843488,
			startOffsetMs: 2166375,
			startOffsetSec: 2166,
			title: 'Chapter 3'
		},
		{
			lengthMs: 868287,
			startOffsetMs: 3009863,
			startOffsetSec: 3010,
			title: 'Chapter 4'
		},
		{
			lengthMs: 973845,
			startOffsetMs: 3878150,
			startOffsetSec: 3878,
			title: 'Chapter 5'
		},
		{
			lengthMs: 1257964,
			startOffsetMs: 4851995,
			startOffsetSec: 4852,
			title: 'Chapter 6'
		},
		{
			lengthMs: 1150549,
			startOffsetMs: 6109959,
			startOffsetSec: 6110,
			title: 'Chapter 7'
		},
		{
			lengthMs: 793844,
			startOffsetMs: 7260508,
			startOffsetSec: 7261,
			title: 'Chapter 8'
		},
		{
			lengthMs: 1101183,
			startOffsetMs: 8054352,
			startOffsetSec: 8054,
			title: 'Chapter 9'
		},
		{
			lengthMs: 1169310,
			startOffsetMs: 9155535,
			startOffsetSec: 9156,
			title: 'Chapter 10'
		},
		{
			lengthMs: 990610,
			startOffsetMs: 10324845,
			startOffsetSec: 10325,
			title: 'Chapter 11'
		},
		{
			lengthMs: 500,
			startOffsetMs: 11315455,
			startOffsetSec: 11315,
			title: 'Camp Forge'
		},
		{
			lengthMs: 582553,
			startOffsetMs: 11315955,
			startOffsetSec: 11316,
			title: 'Chapter 12'
		},
		{
			lengthMs: 3504,
			startOffsetMs: 11898508,
			startOffsetSec: 11899,
			title: 'Part Two'
		},
		{
			lengthMs: 1007168,
			startOffsetMs: 11902012,
			startOffsetSec: 11902,
			title: 'Chapter 13'
		},
		{
			lengthMs: 927359,
			startOffsetMs: 12909180,
			startOffsetSec: 12909,
			title: 'Chapter 14'
		},
		{
			lengthMs: 1053164,
			startOffsetMs: 13836539,
			startOffsetSec: 13837,
			title: 'Chapter 15'
		},
		{
			lengthMs: 775825,
			startOffsetMs: 14889703,
			startOffsetSec: 14890,
			title: 'Chapter 16'
		},
		{
			lengthMs: 868566,
			startOffsetMs: 15665528,
			startOffsetSec: 15666,
			title: 'Chapter 17'
		},
		{
			lengthMs: 1087158,
			startOffsetMs: 16534094,
			startOffsetSec: 16534,
			title: 'Chapter 18'
		},
		{
			lengthMs: 1085719,
			startOffsetMs: 17621252,
			startOffsetSec: 17621,
			title: 'Chapter 19'
		},
		{
			lengthMs: 784881,
			startOffsetMs: 18706971,
			startOffsetSec: 18707,
			title: 'Chapter 20'
		},
		{
			lengthMs: 1570644,
			startOffsetMs: 19491852,
			startOffsetSec: 19492,
			title: 'Chapter 21'
		},
		{
			lengthMs: 1286803,
			startOffsetMs: 21062496,
			startOffsetSec: 21062,
			title: 'Chapter 22'
		},
		{
			lengthMs: 856166,
			startOffsetMs: 22349299,
			startOffsetSec: 22349,
			title: 'Chapter 23'
		},
		{
			lengthMs: 2788252,
			startOffsetMs: 23205465,
			startOffsetSec: 23205,
			title: 'Epilogue'
		},
		{
			lengthMs: 618672,
			startOffsetMs: 25993717,
			startOffsetSec: 25994,
			title: 'Galactic Outlaws'
		},
		{
			lengthMs: 1142375,
			startOffsetMs: 26612389,
			startOffsetSec: 26612,
			title: 'Chapter 1'
		},
		{
			lengthMs: 880547,
			startOffsetMs: 27754764,
			startOffsetSec: 27755,
			title: 'Chapter 2'
		},
		{
			lengthMs: 1227175,
			startOffsetMs: 28635311,
			startOffsetSec: 28635,
			title: 'Chapter 3'
		},
		{
			lengthMs: 541814,
			startOffsetMs: 29862486,
			startOffsetSec: 29862,
			title: 'Chapter 4'
		},
		{
			lengthMs: 589880,
			startOffsetMs: 30404300,
			startOffsetSec: 30404,
			title: 'Chapter 5'
		},
		{
			lengthMs: 1030316,
			startOffsetMs: 30994180,
			startOffsetSec: 30994,
			title: 'Chapter 6'
		},
		{
			lengthMs: 1358600,
			startOffsetMs: 32024496,
			startOffsetSec: 32024,
			title: 'Chapter 7'
		},
		{
			lengthMs: 1502099,
			startOffsetMs: 33383096,
			startOffsetSec: 33383,
			title: 'Chapter 8'
		},
		{
			lengthMs: 1581883,
			startOffsetMs: 34885195,
			startOffsetSec: 34885,
			title: 'Chapter 9'
		},
		{
			lengthMs: 1139264,
			startOffsetMs: 36467078,
			startOffsetSec: 36467,
			title: 'Chapter 10'
		},
		{
			lengthMs: 1295999,
			startOffsetMs: 37606342,
			startOffsetSec: 37606,
			title: 'Chapter 11'
		},
		{
			lengthMs: 1341556,
			startOffsetMs: 38902341,
			startOffsetSec: 38902,
			title: 'Chapter 12'
		},
		{
			lengthMs: 1233537,
			startOffsetMs: 40243897,
			startOffsetSec: 40244,
			title: 'Chapter 13'
		},
		{
			lengthMs: 982715,
			startOffsetMs: 41477434,
			startOffsetSec: 41477,
			title: 'Chapter 14'
		},
		{
			lengthMs: 2074424,
			startOffsetMs: 42460149,
			startOffsetSec: 42460,
			title: 'Chapter 15'
		},
		{
			lengthMs: 1307191,
			startOffsetMs: 44534573,
			startOffsetSec: 44535,
			title: 'Chapter 16'
		},
		{
			lengthMs: 1750413,
			startOffsetMs: 45841764,
			startOffsetSec: 45842,
			title: 'Chapter 17'
		},
		{
			lengthMs: 1449993,
			startOffsetMs: 47592177,
			startOffsetSec: 47592,
			title: 'Chapter 18'
		},
		{
			lengthMs: 1149899,
			startOffsetMs: 49042170,
			startOffsetSec: 49042,
			title: 'Chapter 19'
		},
		{
			lengthMs: 1361200,
			startOffsetMs: 50192069,
			startOffsetSec: 50192,
			title: 'Chapter 20'
		},
		{
			lengthMs: 1272546,
			startOffsetMs: 51553269,
			startOffsetSec: 51553,
			title: 'Chapter 21'
		},
		{
			lengthMs: 1227314,
			startOffsetMs: 52825815,
			startOffsetSec: 52826,
			title: 'Chapter 22'
		},
		{
			lengthMs: 1570551,
			startOffsetMs: 54053129,
			startOffsetSec: 54053,
			title: 'Chapter 23'
		},
		{
			lengthMs: 966043,
			startOffsetMs: 55623680,
			startOffsetSec: 55624,
			title: 'Chapter 24'
		},
		{
			lengthMs: 883751,
			startOffsetMs: 56589723,
			startOffsetSec: 56590,
			title: 'Chapter 25'
		},
		{
			lengthMs: 843999,
			startOffsetMs: 57473474,
			startOffsetSec: 57473,
			title: 'Chapter 26'
		},
		{
			lengthMs: 926569,
			startOffsetMs: 58317473,
			startOffsetSec: 58317,
			title: 'Chapter 27'
		},
		{
			lengthMs: 696784,
			startOffsetMs: 59244042,
			startOffsetSec: 59244,
			title: 'Chapter 28'
		},
		{
			lengthMs: 594988,
			startOffsetMs: 59940826,
			startOffsetSec: 59941,
			title: 'Chapter 29'
		},
		{
			lengthMs: 417495,
			startOffsetMs: 60535814,
			startOffsetSec: 60536,
			title: 'Chapter 30'
		},
		{
			lengthMs: 1469356,
			startOffsetMs: 60953309,
			startOffsetSec: 60953,
			title: 'Chapter 31'
		},
		{
			lengthMs: 89614,
			startOffsetMs: 62422665,
			startOffsetSec: 62423,
			title: 'Epilogue'
		},
		{
			lengthMs: 35730,
			startOffsetMs: 62512279,
			startOffsetSec: 62512,
			title: 'End Credits'
		}
	],
	isAccurate: true,
	region: 'us',
	runtimeLengthMs: 62548009,
	runtimeLengthSec: 62548
}

const chaptersWithIdInternal: WithId<ApiChapter> = {
	_id,
	...parsedChapters
}

export const chaptersWithId = (): WithId<ApiChapter> => {
	return {
		_id,
		...parsedChapters
	}
}

export const chaptersWithoutProjection: ChapterDocument = {
	...chaptersWithIdInternal,
	createdAt: new Date('2019-03-18T00:00:00.000Z'),
	updatedAt: new Date('2019-03-18T00:00:00.000Z')
}

export const chaptersWithoutProjectionUpdatedNow: ChapterDocument = {
	...chaptersWithoutProjection,
	createdAt: new Date('2018-02-20T00:00:00.000Z'),
	updatedAt: new Date()
}
