import { ApiChapter, AudibleChapter } from '#config/types'

export function setupParsedChapter(object: AudibleChapter, asin: string): ApiChapter {
	const info = object.content_metadata.chapter_info
	return {
		asin: asin,
		brandIntroDurationMs: info.brandIntroDurationMs,
		brandOutroDurationMs: info.brandOutroDurationMs,
		chapters: info.chapters.map((chapter) => {
			return {
				lengthMs: chapter.length_ms,
				startOffsetMs: chapter.start_offset_ms,
				startOffsetSec: chapter.start_offset_sec,
				title: chapter.title
			}
		}),
		isAccurate: info.is_accurate,
		region: 'us',
		runtimeLengthMs: info.runtime_length_ms,
		runtimeLengthSec: info.runtime_length_sec
	}
}

export const chapterResponseB017V4IM1G: AudibleChapter = {
	content_metadata: {
		chapter_info: {
			brandIntroDurationMs: 3924,
			brandOutroDurationMs: 4945,
			chapters: [
				{ length_ms: 30924, start_offset_ms: 0, start_offset_sec: 0, title: 'Opening Credits' },
				{
					length_ms: 1732654,
					start_offset_ms: 30924,
					start_offset_sec: 31,
					title: 'Chapter 1: The Boy Who Lived'
				},
				{
					length_ms: 1306377,
					start_offset_ms: 1763578,
					start_offset_sec: 1764,
					title: 'Chapter 2: The Vanishing Glass'
				},
				{
					length_ms: 1455635,
					start_offset_ms: 3069955,
					start_offset_sec: 3070,
					title: 'Chapter 3: The Letters from No One'
				},
				{
					length_ms: 1463530,
					start_offset_ms: 4525590,
					start_offset_sec: 4526,
					title: 'Chapter 4: The Keeper of the Keys'
				},
				{
					length_ms: 2635580,
					start_offset_ms: 5989120,
					start_offset_sec: 5989,
					title: 'Chapter 5: Diagon Alley'
				},
				{
					length_ms: 2294549,
					start_offset_ms: 8624700,
					start_offset_sec: 8625,
					title: 'Chapter 6: The Journey from Platform Nine and Three-Quarters'
				},
				{
					length_ms: 1729190,
					start_offset_ms: 10919249,
					start_offset_sec: 10919,
					title: 'Chapter 7: The Sorting Hat'
				},
				{
					length_ms: 1112537,
					start_offset_ms: 12648439,
					start_offset_sec: 12648,
					title: 'Chapter 8: The Potions Master'
				},
				{
					length_ms: 1858292,
					start_offset_ms: 13760976,
					start_offset_sec: 13761,
					title: 'Chapter 9: The Midnight Duel'
				},
				{
					length_ms: 1532563,
					start_offset_ms: 15619268,
					start_offset_sec: 15619,
					title: "Chapter 10: Hallowe'en"
				},
				{
					length_ms: 1274752,
					start_offset_ms: 17151831,
					start_offset_sec: 17152,
					title: 'Chapter 11: Quidditch'
				},
				{
					length_ms: 2138581,
					start_offset_ms: 18426583,
					start_offset_sec: 18427,
					title: 'Chapter 12: The Mirror of Erised'
				},
				{
					length_ms: 1187352,
					start_offset_ms: 20565164,
					start_offset_sec: 20565,
					title: 'Chapter 13: Nicolas Flamel'
				},
				{
					length_ms: 1275820,
					start_offset_ms: 21752516,
					start_offset_sec: 21753,
					title: 'Chapter 14: Norbert the Norwegian Ridgeback'
				},
				{
					length_ms: 1941954,
					start_offset_ms: 23028336,
					start_offset_sec: 23028,
					title: 'Chapter 15: The Forbidden Forest'
				},
				{
					length_ms: 2474016,
					start_offset_ms: 24970290,
					start_offset_sec: 24970,
					title: 'Chapter 16: Through the Trapdoor'
				},
				{
					length_ms: 2362189,
					start_offset_ms: 27444306,
					start_offset_sec: 27444,
					title: 'Chapter 17: The Man with Two Faces'
				},
				{
					length_ms: 102306,
					start_offset_ms: 29806495,
					start_offset_sec: 29806,
					title: 'The Story Continues in Harry Potter and the Chamber of Secrets'
				}
			],
			is_accurate: true,
			runtime_length_ms: 29908801,
			runtime_length_sec: 29909
		}
	},
	response_groups: ['always-returned', 'chapter_info']
}

export const chapterResponseB08C6YJ1LS: AudibleChapter = {
	content_metadata: {
		chapter_info: {
			brandIntroDurationMs: 3924,
			brandOutroDurationMs: 4945,
			chapters: [
				{
					length_ms: 23707,
					start_offset_ms: 0,
					start_offset_sec: 0,
					title: 'Opening Credits'
				},
				{
					length_ms: 1487424,
					start_offset_ms: 23707,
					start_offset_sec: 24,
					title: 'Episode 1'
				},
				{
					length_ms: 1593330,
					start_offset_ms: 1511131,
					start_offset_sec: 1511,
					title: 'Episode 2'
				},
				{
					length_ms: 1703067,
					start_offset_ms: 3104461,
					start_offset_sec: 3104,
					title: 'Episode 3'
				},
				{
					length_ms: 2048464,
					start_offset_ms: 4807528,
					start_offset_sec: 4808,
					title: 'Episode 4'
				},
				{
					length_ms: 1442887,
					start_offset_ms: 6855992,
					start_offset_sec: 6856,
					title: 'Episode 5'
				},
				{
					length_ms: 1267716,
					start_offset_ms: 8298879,
					start_offset_sec: 8299,
					title: 'Episode 6'
				},
				{
					length_ms: 1353793,
					start_offset_ms: 9566595,
					start_offset_sec: 9567,
					title: 'Episode 7'
				},
				{
					length_ms: 1843617,
					start_offset_ms: 10920388,
					start_offset_sec: 10920,
					title: 'Episode 8'
				},
				{
					length_ms: 952505,
					start_offset_ms: 12764005,
					start_offset_sec: 12764,
					title: 'Episode 9'
				},
				{
					length_ms: 225000,
					start_offset_ms: 13716510,
					start_offset_sec: 13717,
					title: 'End Credits'
				}
			],
			is_accurate: true,
			runtime_length_ms: 13941510,
			runtime_length_sec: 13942
		}
	},
	response_groups: ['always-returned', 'chapter_info']
}

export const chapterParsed1721358595: ApiChapter = {
	asin: '1721358595',
	brandIntroDurationMs: 3924,
	brandOutroDurationMs: 4945,
	chapters: [
		{ lengthMs: 23125, startOffsetMs: 0, startOffsetSec: 0, title: 'Opening Credits' },
		{ lengthMs: 34400, startOffsetMs: 23125, startOffsetSec: 23, title: 'Epigraph' },
		{
			lengthMs: 83489,
			startOffsetMs: 57525,
			startOffsetSec: 58,
			title: 'Tips for Throwing a Dinner Party at the End of the World'
		},
		{
			lengthMs: 7448,
			startOffsetMs: 141014,
			startOffsetSec: 141,
			title: 'Part One: The Softest Invasion'
		},
		{ lengthMs: 292600, startOffsetMs: 148462, startOffsetSec: 148, title: 'Chapter 1' },
		{ lengthMs: 1031081, startOffsetMs: 441062, startOffsetSec: 441, title: 'Chapter 2' },
		{ lengthMs: 604114, startOffsetMs: 1472143, startOffsetSec: 1472, title: 'Chapter 3' },
		{ lengthMs: 770051, startOffsetMs: 2076257, startOffsetSec: 2076, title: 'Chapter 4' },
		{
			lengthMs: 0,
			startOffsetMs: 2846308,
			startOffsetSec: 2846,
			title: 'Part Two: So, Your True Love Has Become a Baby'
		},
		{ lengthMs: 1387389, startOffsetMs: 2083109, startOffsetSec: 2083, title: 'Chapter 5' },
		{ lengthMs: 555120, startOffsetMs: 3470498, startOffsetSec: 3470, title: 'Chapter 6' },
		{ lengthMs: 400125, startOffsetMs: 4025618, startOffsetSec: 4026, title: 'Chapter 7' },
		{ lengthMs: 479097, startOffsetMs: 4425743, startOffsetSec: 4426, title: 'Chapter 8' },
		{ lengthMs: 415103, startOffsetMs: 4904840, startOffsetSec: 4905, title: 'Chapter 9' },
		{ lengthMs: 361117, startOffsetMs: 5319943, startOffsetSec: 5320, title: 'Chapter 10' },
		{ lengthMs: 212136, startOffsetMs: 5681060, startOffsetSec: 5681, title: 'Chapter 11' },
		{ lengthMs: 450119, startOffsetMs: 5893196, startOffsetSec: 5893, title: 'Chapter 12' },
		{ lengthMs: 571094, startOffsetMs: 6343315, startOffsetSec: 6343, title: 'Chapter 13' },
		{ lengthMs: 599208, startOffsetMs: 6914409, startOffsetSec: 6914, title: 'Chapter 14' },
		{
			lengthMs: 4298,
			startOffsetMs: 7513617,
			startOffsetSec: 7514,
			title: 'Part Three: You Can (Never) Go Home Again'
		},
		{ lengthMs: 1041743, startOffsetMs: 7517915, startOffsetSec: 7518, title: 'Chapter 15' },
		{ lengthMs: 508145, startOffsetMs: 8559658, startOffsetSec: 8560, title: 'Chapter 16' },
		{ lengthMs: 1104132, startOffsetMs: 9067803, startOffsetSec: 9068, title: 'Chapter 17' },
		{ lengthMs: 223121, startOffsetMs: 10171935, startOffsetSec: 10172, title: 'Chapter 18' },
		{ lengthMs: 632074, startOffsetMs: 10395056, startOffsetSec: 10395, title: 'Epilogue' },
		{ lengthMs: 61109, startOffsetMs: 11027130, startOffsetSec: 11027, title: 'End Credits' }
	],
	isAccurate: true,
	region: 'us',
	runtimeLengthMs: 11088239,
	runtimeLengthSec: 11088
}
