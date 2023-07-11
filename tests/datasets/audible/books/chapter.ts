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
			brandIntroDurationMs: 2043,
			brandOutroDurationMs: 5061,
			chapters: [
				{ length_ms: 29043, start_offset_ms: 0, start_offset_sec: 0, title: 'Opening Credits' },
				{
					length_ms: 1732701,
					start_offset_ms: 29043,
					start_offset_sec: 29,
					title: 'Chapter 1: The Boy Who Lived'
				},
				{
					length_ms: 1306447,
					start_offset_ms: 1761744,
					start_offset_sec: 1762,
					title: 'Chapter 2: The Vanishing Glass'
				},
				{
					length_ms: 1455705,
					start_offset_ms: 3068191,
					start_offset_sec: 3068,
					title: 'Chapter 3: The Letters from No One'
				},
				{
					length_ms: 1463600,
					start_offset_ms: 4523896,
					start_offset_sec: 4524,
					title: 'Chapter 4: The Keeper of the Keys'
				},
				{
					length_ms: 2635650,
					start_offset_ms: 5987496,
					start_offset_sec: 5987,
					title: 'Chapter 5: Diagon Alley'
				},
				{
					length_ms: 2294595,
					start_offset_ms: 8623146,
					start_offset_sec: 8623,
					title: 'Chapter 6: The Journey from Platform Nine and Three-Quarters'
				},
				{
					length_ms: 1729236,
					start_offset_ms: 10917741,
					start_offset_sec: 10918,
					title: 'Chapter 7: The Sorting Hat'
				},
				{
					length_ms: 1112607,
					start_offset_ms: 12646977,
					start_offset_sec: 12647,
					title: 'Chapter 8: The Potions Master'
				},
				{
					length_ms: 1858339,
					start_offset_ms: 13759584,
					start_offset_sec: 13760,
					title: 'Chapter 9: The Midnight Duel'
				},
				{
					length_ms: 1532609,
					start_offset_ms: 15617923,
					start_offset_sec: 15618,
					title: "Chapter 10: Hallowe'en"
				},
				{
					length_ms: 1274821,
					start_offset_ms: 17150532,
					start_offset_sec: 17151,
					title: 'Chapter 11: Quidditch'
				},
				{
					length_ms: 2138650,
					start_offset_ms: 18425353,
					start_offset_sec: 18425,
					title: 'Chapter 12: The Mirror of Erised'
				},
				{
					length_ms: 1187422,
					start_offset_ms: 20564003,
					start_offset_sec: 20564,
					title: 'Chapter 13: Nicolas Flamel'
				},
				{
					length_ms: 1275890,
					start_offset_ms: 21751425,
					start_offset_sec: 21751,
					title: 'Chapter 14: Norbert the Norwegian Ridgeback'
				},
				{
					length_ms: 1942024,
					start_offset_ms: 23027315,
					start_offset_sec: 23027,
					title: 'Chapter 15: The Forbidden Forest'
				},
				{
					length_ms: 2474086,
					start_offset_ms: 24969339,
					start_offset_sec: 24969,
					title: 'Chapter 16: Through the Trapdoor'
				},
				{
					length_ms: 2362258,
					start_offset_ms: 27443425,
					start_offset_sec: 27443,
					title: 'Chapter 17: The Man with Two Faces'
				},
				{
					length_ms: 102491,
					start_offset_ms: 29805683,
					start_offset_sec: 29806,
					title: 'The Story Continues in Harry Potter and the Chamber of Secrets'
				}
			],
			is_accurate: true,
			runtime_length_ms: 29908174,
			runtime_length_sec: 29908
		}
	},
	response_groups: ['always-returned', 'chapter_info']
}

export const chapterResponseB08C6YJ1LS: AudibleChapter = {
	content_metadata: {
		chapter_info: {
			brandIntroDurationMs: 1927,
			brandOutroDurationMs: 4969,
			chapters: [
				{
					length_ms: 21710,
					start_offset_ms: 0,
					start_offset_sec: 0,
					title: 'Opening Credits'
				},
				{
					length_ms: 1487424,
					start_offset_ms: 21710,
					start_offset_sec: 22,
					title: 'Episode 1'
				},
				{
					length_ms: 1593330,
					start_offset_ms: 1509134,
					start_offset_sec: 1509,
					title: 'Episode 2'
				},
				{
					length_ms: 1703067,
					start_offset_ms: 3102464,
					start_offset_sec: 3102,
					title: 'Episode 3'
				},
				{
					length_ms: 2048464,
					start_offset_ms: 4805531,
					start_offset_sec: 4806,
					title: 'Episode 4'
				},
				{
					length_ms: 1442887,
					start_offset_ms: 6853995,
					start_offset_sec: 6854,
					title: 'Episode 5'
				},
				{
					length_ms: 1267716,
					start_offset_ms: 8296882,
					start_offset_sec: 8297,
					title: 'Episode 6'
				},
				{
					length_ms: 1353793,
					start_offset_ms: 9564598,
					start_offset_sec: 9565,
					title: 'Episode 7'
				},
				{
					length_ms: 1843617,
					start_offset_ms: 10918391,
					start_offset_sec: 10918,
					title: 'Episode 8'
				},
				{
					length_ms: 952505,
					start_offset_ms: 12762008,
					start_offset_sec: 12762,
					title: 'Episode 9'
				},
				{
					length_ms: 225024,
					start_offset_ms: 13714513,
					start_offset_sec: 13715,
					title: 'End Credits'
				}
			],
			is_accurate: true,
			runtime_length_ms: 13939537,
			runtime_length_sec: 13940
		}
	},
	response_groups: ['always-returned', 'chapter_info']
}

export const chapterParsed1721358595: ApiChapter = {
	asin: '1721358595',
	brandIntroDurationMs: 2043,
	brandOutroDurationMs: 5061,
	chapters: [
		{ lengthMs: 21244, startOffsetMs: 0, startOffsetSec: 0, title: 'Opening Credits' },
		{ lengthMs: 34400, startOffsetMs: 21244, startOffsetSec: 21, title: 'Epigraph' },
		{
			lengthMs: 83536,
			startOffsetMs: 55644,
			startOffsetSec: 56,
			title: 'Tips for Throwing a Dinner Party at the End of the World'
		},
		{
			lengthMs: 7448,
			startOffsetMs: 139180,
			startOffsetSec: 139,
			title: 'Part One: The Softest Invasion'
		},
		{ lengthMs: 292600, startOffsetMs: 146628, startOffsetSec: 147, title: 'Chapter 1' },
		{ lengthMs: 1031151, startOffsetMs: 439228, startOffsetSec: 439, title: 'Chapter 2' },
		{ lengthMs: 604183, startOffsetMs: 1470379, startOffsetSec: 1470, title: 'Chapter 3' },
		{ lengthMs: 770167, startOffsetMs: 2074562, startOffsetSec: 2075, title: 'Chapter 4' },
		{
			lengthMs: 0,
			startOffsetMs: 2844729,
			startOffsetSec: 2845,
			title: 'Part Two: So, Your True Love Has Become a Baby'
		},
		{ lengthMs: 1387435, startOffsetMs: 2081484, startOffsetSec: 2081, title: 'Chapter 5' },
		{ lengthMs: 555189, startOffsetMs: 3468919, startOffsetSec: 3469, title: 'Chapter 6' },
		{ lengthMs: 400172, startOffsetMs: 4024108, startOffsetSec: 4024, title: 'Chapter 7' },
		{ lengthMs: 479166, startOffsetMs: 4424280, startOffsetSec: 4424, title: 'Chapter 8' },
		{ lengthMs: 415172, startOffsetMs: 4903446, startOffsetSec: 4903, title: 'Chapter 9' },
		{ lengthMs: 361163, startOffsetMs: 5318618, startOffsetSec: 5319, title: 'Chapter 10' },
		{ lengthMs: 212183, startOffsetMs: 5679781, startOffsetSec: 5680, title: 'Chapter 11' },
		{ lengthMs: 450188, startOffsetMs: 5891964, startOffsetSec: 5892, title: 'Chapter 12' },
		{ lengthMs: 571164, startOffsetMs: 6342152, startOffsetSec: 6342, title: 'Chapter 13' },
		{ lengthMs: 599324, startOffsetMs: 6913316, startOffsetSec: 6913, title: 'Chapter 14' },
		{
			lengthMs: 4298,
			startOffsetMs: 7512640,
			startOffsetSec: 7513,
			title: 'Part Three: You Can (Never) Go Home Again'
		},
		{ lengthMs: 1041743, startOffsetMs: 7516938, startOffsetSec: 7517, title: 'Chapter 15' },
		{ lengthMs: 508191, startOffsetMs: 8558681, startOffsetSec: 8559, title: 'Chapter 16' },
		{ lengthMs: 1104201, startOffsetMs: 9066872, startOffsetSec: 9067, title: 'Chapter 17' },
		{ lengthMs: 223190, startOffsetMs: 10171073, startOffsetSec: 10171, title: 'Chapter 18' },
		{ lengthMs: 632213, startOffsetMs: 10394263, startOffsetSec: 10394, title: 'Epilogue' },
		{ lengthMs: 61271, startOffsetMs: 11026476, startOffsetSec: 11026, title: 'End Credits' }
	],
	isAccurate: true,
	region: 'us',
	runtimeLengthMs: 11087747,
	runtimeLengthSec: 11088
}
