import {
	ApiBook,
	ApiBookSchema,
	ApiGenre,
	ApiSeries,
	AudibleProduct,
	AudibleProductSchema
} from '#config/types'

export interface MinimalResponse {
	asin: string
	authors: AudibleProduct['product']['authors']
	category_ladders: AudibleProduct['product']['category_ladders']
	copyright: AudibleProduct['product']['copyright']
	merchandising_summary: AudibleProduct['product']['merchandising_summary']
	format_type: AudibleProduct['product']['format_type']
	isbn: AudibleProduct['product']['isbn']
	is_adult_product: AudibleProduct['product']['is_adult_product']
	language: AudibleProduct['product']['language']
	narrators: AudibleProduct['product']['narrators']
	product_images: AudibleProduct['product']['product_images']
	publisher_name: AudibleProduct['product']['publisher_name']
	publisher_summary: AudibleProduct['product']['publisher_summary']
	release_date: AudibleProduct['product']['release_date']
	runtime_length_min: AudibleProduct['product']['runtime_length_min']
	title: AudibleProduct['product']['title']
}

export function setupMinimalParsed(
	response: AudibleProduct['product'],
	copyright: number,
	description: string,
	image: string,
	genres: ApiGenre[]
): ApiBook {
	let seriesPrimary: ApiSeries | undefined
	let seriesSecondary: ApiSeries | undefined
	// Only return series for MultiPartBook, makes linter happy
	if (response.content_delivery_type !== 'PodcastParent') {
		if (response.series?.[0]) {
			seriesPrimary = {
				asin: response.series[0].asin,
				name: response.series[0].title,
				position: response.series[0].sequence
			}
		}
		if (response.series?.[1]) {
			seriesSecondary = {
				asin: response.series[1].asin,
				name: response.series[1].title,
				position: response.series[1].sequence
			}
		}
	}
	return ApiBookSchema.parse({
		asin: response.asin,
		authors: response.authors,
		copyright,
		description,
		formatType: response.format_type,
		genres,
		isbn: response.isbn ?? '',
		isAdult: response.is_adult_product,
		language: response.language,
		literatureType: response.thesaurus_subject_keywords?.some((keyword) =>
			keyword.includes('fiction')
		)
			? 'fiction'
			: 'nonfiction',
		narrators: response.narrators,
		image,
		...(response.rating && {
			rating: response.rating.overall_distribution.display_average_rating.toString()
		}),
		publisherName: response.publisher_name,
		summary: response.publisher_summary,
		region: 'us',
		releaseDate: new Date(response.release_date),
		runtimeLengthMin: response.runtime_length_min ?? 0,
		title: response.title,
		...(seriesPrimary && {
			seriesPrimary
		}),
		...(seriesSecondary && {
			seriesSecondary
		})
	})
}

export function setupMinimalResponse(response: AudibleProduct['product']): MinimalResponse {
	return {
		asin: response.asin,
		authors: response.authors,
		category_ladders: response.category_ladders,
		copyright: response.copyright,
		is_adult_product: response.is_adult_product,
		isbn: response.isbn,
		merchandising_summary: response.merchandising_summary,
		format_type: response.format_type,
		language: response.language,
		narrators: response.narrators,
		product_images: response.product_images,
		publisher_name: response.publisher_name,
		publisher_summary: response.publisher_summary,
		release_date: response.release_date,
		runtime_length_min: response.runtime_length_min,
		title: response.title
	}
}

export const B08G9PRS1K = AudibleProductSchema.parse({
	product: {
		asin: 'B08G9PRS1K',
		asset_details: [],
		authors: [
			{
				asin: 'B00G0WYW92',
				name: 'Andy Weir'
			}
		],
		available_codecs: [
			{
				enhanced_codec: 'LC_64_44100_stereo',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'aax_44_64'
			},
			{
				enhanced_codec: 'LC_32_22050_stereo',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'aax_22_32'
			},
			{
				enhanced_codec: 'LC_64_22050_stereo',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'aax_22_64'
			},
			{
				enhanced_codec: 'LC_128_44100_stereo',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'aax_44_128'
			},
			{
				enhanced_codec: 'format4',
				format: 'Format4',
				is_kindle_enhanced: false,
				name: 'format4'
			},
			{
				enhanced_codec: 'mp44464',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'mp4_44_64'
			},
			{
				enhanced_codec: 'mp42264',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'mp4_22_64'
			},
			{
				enhanced_codec: 'mp444128',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'mp4_44_128'
			},
			{
				enhanced_codec: 'mp42232',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'mp4_22_32'
			},
			{
				enhanced_codec: 'aax',
				format: 'Enhanced',
				is_kindle_enhanced: false,
				name: 'aax'
			}
		],
		category_ladders: [
			{
				ladder: [
					{
						id: '18580606011',
						name: 'Science Fiction & Fantasy'
					},
					{
						id: '18580628011',
						name: 'Science Fiction'
					},
					{
						id: '18580629011',
						name: 'Adventure'
					}
				],
				root: 'Genres'
			},
			{
				ladder: [
					{
						id: '18580606011',
						name: 'Science Fiction & Fantasy'
					},
					{
						id: '18580628011',
						name: 'Science Fiction'
					},
					{
						id: '18580639011',
						name: 'Hard Science Fiction'
					}
				],
				root: 'Genres'
			},
			{
				ladder: [
					{
						id: '18580606011',
						name: 'Science Fiction & Fantasy'
					},
					{
						id: '18580628011',
						name: 'Science Fiction'
					},
					{
						id: '18580645011',
						name: 'Space Opera'
					}
				],
				root: 'Genres'
			}
		],
		content_delivery_type: 'MultiPartBook',
		content_type: 'Product',
		copyright: '©2021 Andy Weir (P)2021 Audible Studios',
		date_first_available: '2021-05-04',
		extended_product_description:
			"<p>Ryland Grace is the sole survivor on a desperate, last-chance mission - and if he fails, humanity and the Earth itself will perish. Except that right now, he doesn't know that. He can't even remember his own name, let alone the nature of his assignment or how to complete it. All he knows is that he's been asleep for a very, very long time. And he's just been awakened to find himself millions of miles from home, with nothing but two corpses for company.</p>",
		format_type: 'unabridged',
		has_children: true,
		is_adult_product: false,
		is_listenable: true,
		is_pdf_url_available: false,
		is_purchasability_suppressed: false,
		is_vvab: false,
		isbn: '9781603935470',
		issue_date: '2021-05-04',
		language: 'english',
		merchandising_description: '',
		merchandising_summary:
			'<p>When the Sun is threatened by an alien microbe, the fate of humanity rests on the shoulders of an unlikely hero – and an even more unlikely friendship.</p>',
		narrators: [
			{
				name: 'Ray Porter'
			}
		],
		platinum_keywords: [
			'Science_Fiction_Fantasy/Science_Fiction',
			'Science_Fiction_Fantasy',
			'Science_Fiction_Fantasy/Science_Fiction/Adventure',
			'Science_Fiction_Fantasy/Science_Fiction/High_Tech',
			'Sci-Fi_Fantasy/Space_Opera'
		],
		product_images: {
			'1024': 'https://m.media-amazon.com/images/I/81wvR09gLRL._SL1024_.jpg',
			'500': 'https://m.media-amazon.com/images/I/51iIXx9XZ3L._SL500_.jpg'
		},
		product_site_launch_date: '2020-08-19T19:32:00Z',
		publication_datetime: '2021-05-04T07:00:00Z',
		publisher_name: 'Audible Studios',
		publisher_summary:
			"<p><b>THE #1 </b><b><i>NEW YORK TIMES</i></b><b> BESTSELLER FROM THE AUTHOR OF </b><b><i>THE MARTIAN.</i></b><b> Now a major motion picture starring Ryan Gosling, directed by Phil Lord and Christopher Miller, with a screenplay by Drew Goddard. Project Hail Mary hits theaters March 20, 2026.</b></p> <p><b><i>Winner of the 2022 Audie Awards' Audiobook of the Year</i></b></p> <p><b><i>Number-One Audible and </i></b><b>New York Times</b><b><i> Audio Best Seller</i></b></p> <p><b><i>More than two million audiobooks sold</i></b></p> <p><b>A lone astronaut must save the earth from disaster in this incredible new science-based thriller from the number-one </b><b><i>New York Times</i></b><b> best-selling author of </b><b><i>The Martian</i></b><b>.</b></p> <p>Ryland Grace is the sole survivor on a desperate, last-chance mission - and if he fails, humanity and the Earth itself will perish.</p> <p>Except that right now, he doesn't know that. He can't even remember his own name, let alone the nature of his assignment or how to complete it.</p> <p>All he knows is that he's been asleep for a very, very long time. And he's just been awakened to find himself millions of miles from home, with nothing but two corpses for company.</p> <p>His crewmates dead, his memories fuzzily returning, he realizes that an impossible task now confronts him. Alone on this tiny ship that's been cobbled together by every government and space agency on the planet and hurled into the depths of space, it's up to him to conquer an extinction-level threat to our species.</p> <p>And thanks to an unexpected ally, he just might have a chance.</p> <p>Part scientific mystery, part dazzling interstellar journey, <i>Project Hail Mary</i> is a tale of discovery, speculation, and survival to rival <i>The Martian</i> - while taking us to places it never dreamed of going.</p> <p>PLEASE NOTE: To accommodate this audio edition, some changes to the original text have been made with the approval of author Andy Weir.</p>",
		rating: {
			num_reviews: 18832,
			overall_distribution: {
				average_rating: 4.865184063594208,
				display_average_rating: '4.9',
				display_stars: 5.0,
				num_five_star_ratings: 141378,
				num_four_star_ratings: 14019,
				num_one_star_ratings: 288,
				num_ratings: 158505,
				num_three_star_ratings: 2262,
				num_two_star_ratings: 558
			},
			performance_distribution: {
				average_rating: 4.925095004491121,
				display_average_rating: '4.9',
				display_stars: 5.0,
				num_five_star_ratings: 136044,
				num_four_star_ratings: 7138,
				num_one_star_ratings: 185,
				num_ratings: 144730,
				num_three_star_ratings: 1126,
				num_two_star_ratings: 237
			},
			story_distribution: {
				average_rating: 4.840342079527248,
				display_average_rating: '4.8',
				display_stars: 5.0,
				num_five_star_ratings: 125817,
				num_four_star_ratings: 14956,
				num_one_star_ratings: 318,
				num_ratings: 144177,
				num_three_star_ratings: 2467,
				num_two_star_ratings: 619
			}
		},
		read_along_support: 'true',
		release_date: '2021-05-04',
		runtime_length_min: 970,
		sku: 'BK_ADBL_051843',
		sku_lite: 'BK_ADBL_051843',
		social_media_images: {
			facebook:
				'https://m.media-amazon.com/images/I/51b6fvQr1-L._SL10_UR1600,800_CR200,50,1200,630_CLa%7C1200,630%7C51b6fvQr1-L.jpg%7C0,0,1200,630+82,82,465,465_PJAdblSocialShare-Gradientoverlay-largeasin-0to70,TopLeft,0,0_PJAdblSocialShare-AudibleLogo-Large,TopLeft,600,270_OU01_ZBLISTENING%20ON,617,216,52,500,AudibleSansMd,30,255,255,255.jpg',
			twitter:
				'https://m.media-amazon.com/images/I/51b6fvQr1-L._SL10_UR1600,800_CR200,50,1024,512_CLa%7C1024,512%7C51b6fvQr1-L.jpg%7C0,0,1024,512+67,67,376,376_PJAdblSocialShare-Gradientoverlay-twitter-largeasin-0to60,TopLeft,0,0_PJAdblSocialShare-AudibleLogo-Medium,TopLeft,490,223_OU01_ZBLISTENING%20ON,483,152,55,450,AudibleSansMd,32,255,255,255.jpg'
		},
		thesaurus_subject_keywords: ['literature-and-fiction'],
		title: 'Project Hail Mary'
	},
	response_groups: [
		'product_desc',
		'always-returned',
		'product_extended_attrs',
		'contributors',
		'series',
		'rating',
		'category_ladders',
		'media',
		'product_attrs',
		'product_details'
	]
})

export const minimalB08G9PRS1K: MinimalResponse = setupMinimalResponse(B08G9PRS1K.product)

export const B08C6YJ1LS = AudibleProductSchema.parse({
	product: {
		asin: 'B08C6YJ1LS',
		asset_details: [],
		authors: [
			{
				asin: 'B000APZGGS',
				name: 'James Patterson'
			},
			{
				asin: 'B09MXLL1JR',
				name: 'Aaron Tracy'
			},
			{
				asin: 'B07R2F2DXH',
				name: 'Ryan Silbert'
			}
		],
		available_codecs: [
			{
				enhanced_codec: 'LC_64_44100_stereo',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'aax_44_64'
			},
			{
				enhanced_codec: 'LC_128_44100_stereo',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'aax_44_128'
			},
			{
				enhanced_codec: 'mp444128',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'mp4_44_128'
			},
			{
				enhanced_codec: 'mp44464',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'mp4_44_64'
			},
			{
				enhanced_codec: 'aax',
				format: 'Enhanced',
				is_kindle_enhanced: false,
				name: 'aax'
			}
		],
		category_ladders: [
			{
				ladder: [
					{
						id: '18574597011',
						name: 'Mystery, Thriller & Suspense'
					},
					{
						id: '18574621011',
						name: 'Thriller & Suspense'
					},
					{
						id: '18574623011',
						name: 'Crime Thrillers'
					}
				],
				root: 'Genres'
			}
		],
		content_delivery_type: 'SinglePartBook',
		content_type: 'Show',
		copyright:
			'©2020 James Patterson, Friendly Heights, Inc., and Origin Story Entertainment, LLC (P)2020 Audible Originals, LLC.',
		date_first_available: '2021-03-11',
		extended_product_description:
			"<p>In <i>The Coldest Case: A Black Book Audio Drama</i>, homicide detective Billy Harney sends his new partner, Kate, deep undercover in a notorious Chicago drug ring. When several members of the ring soon turn up dead, Billy abruptly pulls Kate out, blowing her cover. Kate’s informant inside the gang quickly disappears. As does the ring’s black book.... When Billy can’t find the informant, he wonders if Kate is secretly harboring her, since the two grew close during Kate's weeks undercover.</p>",
		format_type: 'original_recording',
		has_children: false,
		is_adult_product: false,
		is_listenable: true,
		is_pdf_url_available: false,
		is_purchasability_suppressed: false,
		is_vvab: false,
		isbn: '9781603934619',
		issue_date: '2021-03-11',
		language: 'english',
		merchandising_description: '',
		merchandising_summary:
			"<p>James Patterson's Detective Billy Harney is back, this time investigating murders in a notorious Chicago drug ring, which will lead him, his sister, and his new partner through a dangerous web of corrupt politicians, vengeful billionaires, and violent dark web conspiracies.... </p>",
		narrators: [
			{
				name: 'Aaron Paul'
			},
			{
				name: 'Krysten Ritter'
			},
			{
				name: 'Nathalie Emmanuel'
			},
			{
				name: 'Beau Bridges'
			},
			{
				asin: 'B0C9MBTDV9',
				name: 'full cast'
			}
		],
		platinum_keywords: [
			'Mysteries_Thrillers/Crime',
			'Mysteries_Thrillers/Suspense',
			'Mysteries_Thrillers/Mysteries'
		],
		product_images: {
			'1024': 'https://m.media-amazon.com/images/I/91H9ynKGNwL._SL1024_.jpg',
			'500': 'https://m.media-amazon.com/images/I/51SteOEMD8L._SL500_.jpg'
		},
		product_site_launch_date: '2020-07-01T21:11:00Z',
		program_participation: 'Audible Original',
		publication_datetime: '2021-03-11T08:00:00Z',
		publication_name: 'A Billy Harney Thriller',
		publisher_name: 'Audible Originals',
		publisher_summary:
			"<p><b>Please note</b>: This audio drama is for mature audiences only. It contains strong language, violence, and sexual content. Discretion is advised. </p> <p><b>James Patterson's Detective Billy Harney is back, this time investigating murders in a notorious Chicago drug ring, which will lead him, his sister, and his new partner through a dangerous web of corrupt politicians, vengeful billionaires, and violent dark web conspiracies. </b></p> <p>In <i>The Coldest Case: A Black Book Audio Drama</i>, homicide detective Billy Harney sends his new partner, Kate, deep undercover in a notorious Chicago drug ring. When several members of the ring soon turn up dead, Billy abruptly pulls Kate out, blowing her cover. Kate’s informant inside the gang quickly disappears. As does the ring’s black book.... </p> <p>When Billy can’t find the informant, he wonders if Kate is secretly harboring her, since the two grew close during Kate's weeks undercover. As Billy and Kate investigate the ring’s murders, they’ll be pulled into a dangerous web of corrupt politicians, vengeful billionaires, drugged pro-athletes, and violent, dark web conspiracies, all in search of the missing black book. </p>",
		rating: {
			num_reviews: 1920,
			overall_distribution: {
				average_rating: 4.336082661107587,
				display_average_rating: '4.3',
				display_stars: 4.5,
				num_five_star_ratings: 13235,
				num_four_star_ratings: 5093,
				num_one_star_ratings: 644,
				num_ratings: 22066,
				num_three_star_ratings: 2301,
				num_two_star_ratings: 793
			},
			performance_distribution: {
				average_rating: 4.550625938908363,
				display_average_rating: '4.6',
				display_stars: 4.5,
				num_five_star_ratings: 14527,
				num_four_star_ratings: 3221,
				num_one_star_ratings: 425,
				num_ratings: 19970,
				num_three_star_ratings: 1338,
				num_two_star_ratings: 459
			},
			story_distribution: {
				average_rating: 4.247972598599707,
				display_average_rating: '4.2',
				display_stars: 4.0,
				num_five_star_ratings: 11181,
				num_four_star_ratings: 4689,
				num_one_star_ratings: 706,
				num_ratings: 19853,
				num_three_star_ratings: 2414,
				num_two_star_ratings: 863
			}
		},
		read_along_support: 'false',
		release_date: '2021-03-11',
		runtime_length_min: 232,
		series: [
			{
				asin: 'B08RLSPY4J',
				sequence: '0.5',
				title: 'A Billy Harney Thriller',
				url: '/pd/A-Black-Book-Thriller-Audiobook/B08RLSPY4J'
			}
		],
		sku: 'OR_ORIG_001404',
		sku_lite: 'OR_ORIG_001404',
		social_media_images: {
			facebook:
				'https://m.media-amazon.com/images/I/51SteOEMD8L._SL10_UR1600,800_CR200,50,1200,630_CLa%7C1200,630%7C51SteOEMD8L.jpg%7C0,0,1200,630+82,82,465,465_PJAdblSocialShare-Gradientoverlay-largeasin-0to70,TopLeft,0,0_PJAdblSocialShare-AudibleLogo-Large,TopLeft,600,270_OU01_ZBLISTENING%20ON,617,216,52,500,AudibleSansMd,30,255,255,255.jpg',
			twitter:
				'https://m.media-amazon.com/images/I/51SteOEMD8L._SL10_UR1600,800_CR200,50,1024,512_CLa%7C1024,512%7C51SteOEMD8L.jpg%7C0,0,1024,512+67,67,376,376_PJAdblSocialShare-Gradientoverlay-twitter-largeasin-0to60,TopLeft,0,0_PJAdblSocialShare-AudibleLogo-Medium,TopLeft,490,223_OU01_ZBLISTENING%20ON,483,152,55,450,AudibleSansMd,32,255,255,255.jpg'
		},
		thesaurus_subject_keywords: ['audible_original', 'literature-and-fiction'],
		title: 'The Coldest Case: A Black Book Audio Drama'
	},
	response_groups: [
		'product_desc',
		'always-returned',
		'product_extended_attrs',
		'contributors',
		'series',
		'rating',
		'category_ladders',
		'media',
		'product_attrs',
		'product_details'
	]
})

export const minimalB08C6YJ1LS: MinimalResponse = setupMinimalResponse(B08C6YJ1LS.product)

export const B017V4IM1G = AudibleProductSchema.parse({
	product: {
		asin: 'B017V4IM1G',
		asset_details: [],
		authors: [
			{
				asin: 'B000AP9A6K',
				name: 'J.K. Rowling'
			}
		],
		available_codecs: [
			{
				enhanced_codec: 'LC_32_22050_stereo',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'aax_22_32'
			},
			{
				enhanced_codec: 'LC_128_44100_stereo',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'aax_44_128'
			},
			{
				enhanced_codec: 'LC_64_22050_stereo',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'aax_22_64'
			},
			{
				enhanced_codec: 'LC_64_44100_stereo',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'aax_44_64'
			},
			{
				enhanced_codec: 'mp42264',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'mp4_22_64'
			},
			{
				enhanced_codec: 'mp444128',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'mp4_44_128'
			},
			{
				enhanced_codec: 'mp44464',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'mp4_44_64'
			},
			{
				enhanced_codec: 'mp42232',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'mp4_22_32'
			},
			{
				enhanced_codec: 'aax',
				format: 'Enhanced',
				is_kindle_enhanced: false,
				name: 'aax'
			}
		],
		category_ladders: [
			{
				ladder: [
					{
						id: '18572091011',
						name: "Children's Audiobooks"
					},
					{
						id: '18572323011',
						name: 'Growing Up & Facts of Life'
					}
				],
				root: 'Genres'
			},
			{
				ladder: [
					{
						id: '18572091011',
						name: "Children's Audiobooks"
					},
					{
						id: '18572323011',
						name: 'Growing Up & Facts of Life'
					}
				],
				root: 'Genres'
			},
			{
				ladder: [
					{
						id: '18572091011',
						name: "Children's Audiobooks"
					},
					{
						id: '18572491011',
						name: 'Literature & Fiction'
					},
					{
						id: '18572505011',
						name: 'Family Life'
					}
				],
				root: 'Genres'
			},
			{
				ladder: [
					{
						id: '18572091011',
						name: "Children's Audiobooks"
					},
					{
						id: '18572586011',
						name: 'Science Fiction & Fantasy'
					},
					{
						id: '18572587011',
						name: 'Fantasy & Magic'
					}
				],
				root: 'Genres'
			},
			{
				ladder: [
					{
						id: '18580606011',
						name: 'Science Fiction & Fantasy'
					},
					{
						id: '18580607011',
						name: 'Fantasy'
					}
				],
				root: 'Genres'
			}
		],
		content_delivery_type: 'SinglePartBook',
		content_type: 'Product',
		copyright:
			'©1997 J.K. Rowling (P)1999 Listening Library, an imprint of Penguin Random House Audio Publishing Group',
		date_first_available: '2015-11-20',
		editorial_reviews: [
			'<p>"To call Dale a \'reader\' of books is like saying Monet was a Sunday painter." (<i>Los Angeles Times</i>)</p>'
		],
		extended_product_description:
			"<p>Harry Potter has never even heard of Hogwarts when the letters start dropping on the doormat at number four, Privet Drive. Addressed in green ink on yellowish parchment with a purple seal, they are swiftly confiscated by his grisly aunt and uncle. Then, on Harry's eleventh birthday, a great beetle-eyed giant of a man called Rubeus Hagrid bursts in with some astonishing news: Harry Potter is a wizard, and he has a place at Hogwarts School of Witchcraft and Wizardry. An incredible adventure is about to begin! </p>",
		format_type: 'unabridged',
		has_children: false,
		is_adult_product: false,
		is_listenable: true,
		is_pdf_url_available: false,
		is_purchasability_suppressed: false,
		is_vvab: false,
		isbn: '9781781102633',
		issue_date: '2015-11-20',
		language: 'english',
		merchandising_description: '',
		merchandising_summary:
			'<p>Harry Potter has never even heard of Hogwarts when the letters start dropping on the doormat at number four, Privet Drive. Addressed in green ink on yellowish parchment with a purple seal, they are swiftly confiscated by his grisly aunt and uncle....</p>',
		narrators: [
			{
				name: 'Jim Dale'
			}
		],
		platinum_keywords: [
			'Childrens_Audiobooks/Growing_Up_Facts_of_Life',
			'Childrens_Audiobooks/Growing_Up_Facts_of_Life/Family_Life',
			'Childrens_Audiobooks',
			'Childrens_Audiobooks/Growing_Up_Facts_of_Life/General',
			'Childrens_Audiobooks/Science_Fiction_Fantasy',
			'Childrens_Audiobooks/Science_Fiction_Fantasy/Fantasy_Magic',
			'Science_Fiction_Fantasy/Fantasy',
			'Science_Fiction_Fantasy',
			'Teen_Young_Adult/Science_Fiction_Fantasy/Fantasy',
			'Teen_Young_Adult/Science_Fiction_Fantasy',
			'Teen_Young_Adult',
			'Teen_Young_Adult/Science_Fiction_Fantasy/Fantasy/Epic'
		],
		product_images: {
			'1024': 'https://m.media-amazon.com/images/I/91eopoUCjLL._SL1024_.jpg',
			'500': 'https://m.media-amazon.com/images/I/51xJbFMRsxL._SL500_.jpg'
		},
		product_site_launch_date: '2015-11-13T05:00:00Z',
		publication_datetime: '2015-11-20T08:00:00Z',
		publication_name: 'Harry Potter',
		publisher_name: 'Pottermore Publishing',
		publisher_summary:
			"<p>Jim Dale's Grammy Award-winning performance of J.K. Rowling's iconic stories is a listening adventure for the whole family.</p> <p><i>Turning the envelope over, his hand trembling, Harry saw a purple wax seal bearing a coat of arms; a lion, an eagle, a badger and a snake surrounding a large letter 'H'.</i></p> <p>Close your eyes and enter the magical world of Harry Potter. In these editions, Jim Dale's characterful narration is so entertaining, fun, and theatrical you can almost hear the crackle of the fire in the Gryffindor common room.</p> <p>Harry Potter has never even heard of Hogwarts when the letters start dropping on the doormat at number four, Privet Drive. Addressed in green ink on yellowish parchment with a purple seal, they are swiftly confiscated by his grisly aunt and uncle. Then, on Harry's eleventh birthday, a great beetle-eyed giant of a man called Rubeus Hagrid bursts in with some astonishing news: Harry Potter is a wizard, and he has a place at Hogwarts School of Witchcraft and Wizardry. An incredible adventure is about to begin!</p> <p>Having become classics of our time, the Harry Potter stories never fail to bring comfort and escapism. With their message of hope, belonging and the enduring power of truth and love, the story of the Boy Who Lived continues to delight generations of new listeners.</p>",
		rating: {
			num_reviews: 7606,
			overall_distribution: {
				average_rating: 4.910364294844483,
				display_average_rating: '4.9',
				display_stars: 5.0,
				num_five_star_ratings: 175191,
				num_four_star_ratings: 9957,
				num_one_star_ratings: 619,
				num_ratings: 187760,
				num_three_star_ratings: 1582,
				num_two_star_ratings: 411
			},
			performance_distribution: {
				average_rating: 4.8522852606445515,
				display_average_rating: '4.9',
				display_stars: 5.0,
				num_five_star_ratings: 147488,
				num_four_star_ratings: 12780,
				num_one_star_ratings: 684,
				num_ratings: 165014,
				num_three_star_ratings: 3327,
				num_two_star_ratings: 735
			},
			story_distribution: {
				average_rating: 4.926727990126639,
				display_average_rating: '4.9',
				display_stars: 5.0,
				num_five_star_ratings: 154981,
				num_four_star_ratings: 7804,
				num_one_star_ratings: 317,
				num_ratings: 164483,
				num_three_star_ratings: 1163,
				num_two_star_ratings: 218
			}
		},
		read_along_support: 'false',
		release_date: '2015-11-20',
		runtime_length_min: 498,
		series: [
			{
				asin: 'B0182NWM9I',
				sequence: '1',
				title: 'Harry Potter',
				url: '/pd/Harry-Potter-Audiobook/B0182NWM9I'
			},
			{
				asin: 'B07CM5ZDJL',
				sequence: '1',
				title: 'Wizarding World Collection',
				url: '/pd/Wizarding-World-Audiobook/B07CM5ZDJL'
			}
		],
		sku: 'BK_POTR_000001',
		sku_lite: 'BK_POTR_000001',
		social_media_images: {
			facebook:
				'https://m.media-amazon.com/images/I/51xJbFMRsxL._SL10_UR1600,800_CR200,50,1200,630_CLa%7C1200,630%7C51xJbFMRsxL.jpg%7C0,0,1200,630+82,82,465,465_PJAdblSocialShare-Gradientoverlay-largeasin-0to70,TopLeft,0,0_PJAdblSocialShare-AudibleLogo-Large,TopLeft,600,270_OU01_ZBLISTENING%20ON,617,216,52,500,AudibleSansMd,30,255,255,255.jpg',
			twitter:
				'https://m.media-amazon.com/images/I/51xJbFMRsxL._SL10_UR1600,800_CR200,50,1024,512_CLa%7C1024,512%7C51xJbFMRsxL.jpg%7C0,0,1024,512+67,67,376,376_PJAdblSocialShare-Gradientoverlay-twitter-largeasin-0to60,TopLeft,0,0_PJAdblSocialShare-AudibleLogo-Medium,TopLeft,490,223_OU01_ZBLISTENING%20ON,483,152,55,450,AudibleSansMd,32,255,255,255.jpg'
		},
		thesaurus_subject_keywords: ['literature-and-fiction'],
		title: "Harry Potter and the Sorcerer's Stone, Book 1"
	},
	response_groups: [
		'product_desc',
		'always-returned',
		'product_extended_attrs',
		'contributors',
		'series',
		'rating',
		'category_ladders',
		'media',
		'product_attrs',
		'product_details'
	]
})

export const B07BS4RKGH = {
	product: {
		asin: 'B07BS4RKGH',
		asset_details: [],
		authors: [
			{
				asin: 'B019LK4QFY',
				name: 'Phil Price'
			}
		],
		available_codecs: [
			{
				enhanced_codec: 'LC_32_22050_stereo',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'aax_22_32'
			},
			{
				enhanced_codec: 'LC_64_22050_stereo',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'aax_22_64'
			},
			{
				enhanced_codec: 'format4',
				format: 'Format4',
				is_kindle_enhanced: false,
				name: 'format4'
			},
			{
				enhanced_codec: 'mp42264',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'mp4_22_64'
			},
			{
				enhanced_codec: 'piff2264',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'piff_22_64'
			},
			{
				enhanced_codec: 'mp42232',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'mp4_22_32'
			},
			{
				enhanced_codec: 'piff2232',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'piff_22_32'
			},
			{
				enhanced_codec: 'aax',
				format: 'Enhanced',
				is_kindle_enhanced: false,
				name: 'aax'
			}
		],
		category_ladders: [
			{
				ladder: [
					{
						id: '18574426011',
						name: 'Literature & Fiction'
					},
					{
						id: '18574490011',
						name: 'Horror'
					}
				],
				root: 'Genres'
			},
			{
				ladder: [
					{
						id: '18574597011',
						name: 'Mystery, Thriller & Suspense'
					},
					{
						id: '18574621011',
						name: 'Thriller & Suspense'
					},
					{
						id: '18574638011',
						name: 'Supernatural'
					}
				],
				root: 'Genres'
			}
		],
		content_delivery_type: 'MultiPartBook',
		content_type: 'Product',
		copyright: '©2015 Phil Price (P)2018 Phil Price',
		editorial_reviews: [''],
		extended_product_description:
			"<p>It happens every year. A select few disappear, never to return. From The Falkland Islands to the Himalayas, Puerto Rico to England, people are vanishing without a trace or explanation. A young man who's lost everything stumbles across an ancient secret. Can he unlock the mystery? Will he find those who need him? Can he escape the Unknown? </p>",
		format_type: 'unabridged',
		has_children: true,
		is_adult_product: false,
		is_listenable: true,
		is_pdf_url_available: false,
		is_purchasability_suppressed: false,
		is_vvab: false,
		issue_date: '2018-03-29',
		language: 'english',
		merchandising_description: '',
		merchandising_summary:
			"<p>It happens every year. A select few disappear, never to return. From The Falkland Islands to the Himalayas, people are vanishing without a trace. A young man who's lost everything stumbles across a secret. Can he unlock the mystery? Can he escape the Unknown? Listen to find out more....</p>",
		narrators: [
			{
				name: 'Hannibal Hills'
			}
		],
		platinum_keywords: [
			'Literature_Fiction/Horror',
			'LGBT/Literature_Fiction',
			'Mysteries_Thrillers/Mysteries',
			'Mysteries_Thrillers/Supernatural_Paranormal',
			'Mysteries_Thrillers/Suspense'
		],
		product_images: {
			'1024': 'https://m.media-amazon.com/images/I/91leOGfyEML._SL1024_.jpg',
			'500': 'https://m.media-amazon.com/images/I/61tD+Z-UVPL._SL500_.jpg'
		},
		product_site_launch_date: '2018-03-29T20:19:00Z',
		publication_datetime: '2018-03-29T20:19:00Z',
		publication_name: 'The Forsaken Series',
		publisher_name: 'Creativia Publishing',
		publisher_summary:
			"<p>It happens every year. A select few disappear, never to return. From The Falkland Islands to the Himalayas, Puerto Rico to England, people are vanishing without a trace or explanation. A young man who's lost everything stumbles across an ancient secret. Can he unlock the mystery? Will he find those who need him? Can he escape the Unknown?</p>",
		rating: {
			num_reviews: 16,
			overall_distribution: {
				average_rating: 4.078947368421052,
				display_average_rating: '4.1',
				display_stars: 4.0,
				num_five_star_ratings: 16,
				num_four_star_ratings: 15,
				num_one_star_ratings: 2,
				num_ratings: 38,
				num_three_star_ratings: 3,
				num_two_star_ratings: 2
			},
			performance_distribution: {
				average_rating: 4.5675675675675675,
				display_average_rating: '4.6',
				display_stars: 4.5,
				num_five_star_ratings: 26,
				num_four_star_ratings: 9,
				num_one_star_ratings: 1,
				num_ratings: 37,
				num_three_star_ratings: 0,
				num_two_star_ratings: 1
			},
			story_distribution: {
				average_rating: 3.8947368421052633,
				display_average_rating: '3.9',
				display_stars: 4.0,
				num_five_star_ratings: 15,
				num_four_star_ratings: 13,
				num_one_star_ratings: 3,
				num_ratings: 38,
				num_three_star_ratings: 4,
				num_two_star_ratings: 3
			}
		},
		read_along_support: 'true',
		release_date: '2018-03-29',
		runtime_length_min: 963,
		series: [
			{
				asin: 'B07C9N765Z',
				sequence: '1',
				title: 'The Forsaken Series',
				url: '/pd/The-Forsaken-Series-Audiobook/B07C9N765Z'
			}
		],
		sku: 'BK_ACX0_112313',
		sku_lite: 'BK_ACX0_112313',
		social_media_images: {
			facebook:
				'https://m.media-amazon.com/images/I/61tD+Z-UVPL._SL10_UR1600,800_CR200,50,1200,630_CLa%7C1200,630%7C61tD+Z-UVPL.jpg%7C0,0,1200,630+82,82,465,465_PJAdblSocialShare-Gradientoverlay-largeasin-0to70,TopLeft,0,0_PJAdblSocialShare-AudibleLogo-Large,TopLeft,600,270_OU01_ZBLISTENING%20ON,617,216,52,500,AudibleSansMd,30,255,255,255.jpg',
			twitter:
				'https://m.media-amazon.com/images/I/61tD+Z-UVPL._SL10_UR1600,800_CR200,50,1024,512_CLa%7C1024,512%7C61tD+Z-UVPL.jpg%7C0,0,1024,512+67,67,376,376_PJAdblSocialShare-Gradientoverlay-twitter-largeasin-0to60,TopLeft,0,0_PJAdblSocialShare-AudibleLogo-Medium,TopLeft,490,223_OU01_ZBLISTENING%20ON,483,152,55,450,AudibleSansMd,32,255,255,255.jpg'
		},
		subtitle: 'The Forsaken Series, Book 1',
		thesaurus_subject_keywords: ['literature-and-fiction']
	},
	response_groups: [
		'product_desc',
		'always-returned',
		'product_extended_attrs',
		'contributors',
		'series',
		'rating',
		'category_ladders',
		'media',
		'product_attrs',
		'product_details'
	]
}

export const podcast = AudibleProductSchema.parse({
	product: {
		asin: 'B08JC5J5HR',
		asset_details: [],
		authors: [
			{
				name: 'Jackson Musker'
			}
		],
		category_ladders: [
			{
				ladder: [
					{
						id: '18580606011',
						name: 'Science Fiction & Fantasy'
					},
					{
						id: '18580607011',
						name: 'Fantasy'
					}
				],
				root: 'Genres'
			},
			{
				ladder: [
					{
						id: '18580606011',
						name: 'Science Fiction & Fantasy'
					},
					{
						id: '18580628011',
						name: 'Science Fiction'
					}
				],
				root: 'Genres'
			}
		],
		content_delivery_type: 'PodcastParent',
		content_type: 'Podcast',
		continuity: 'serial',
		copyright: '©2020 Audible Originals, LLC (P)2020 Audible Originals, LLC',
		episode_count: 12,
		extended_product_description:
			'Wisecracking, marine biologist Bee Guerrero has signed up for the trip of a lifetime: a series of dives deep into the pitch-black waters of Saturn’s moon, Enceladus.',
		format_type: 'original_recording',
		has_children: true,
		is_adult_product: false,
		is_listenable: false,
		is_pdf_url_available: false,
		is_purchasability_suppressed: true,
		is_vvab: false,
		issue_date: '2020-10-01',
		language: 'english',
		merchandising_description: '',
		merchandising_summary:
			'Wisecracking, marine biologist Bee Guerrero has signed up for the trip of a lifetime: a series of dives deep into the pitch-black waters of Saturn’s moon, Enceladus....',
		narrators: [
			{
				name: 'Octavia Chavez-Richmond'
			},
			{
				name: 'James Ludwig'
			},
			{
				name: 'Pun Bandhu'
			},
			{
				name: 'Lizan Mitchell'
			},
			{
				name: 'a full cast'
			}
		],
		new_episode_added_date: '2022-09-04T20:18:54.018Z',
		platinum_keywords: ['Sci-Fi _ Fantasy', 'Sci-Fi Contemporary'],
		product_images: {
			'1024': 'https://m.media-amazon.com/images/I/9125JjSWeCL._SL1024_.jpg',
			'500': 'https://m.media-amazon.com/images/I/51izwaIIZ2L._SL500_.jpg'
		},
		product_site_launch_date: '2020-10-01T07:00:00Z',
		program_participation: 'Audible Original',
		publication_datetime: '2020-10-01T07:00:00Z',
		publisher_name: 'Audible Originals',
		publisher_summary:
			'<p>In this scripted Audible Original, wisecracking marine biologist and astronaut Bee Guerrero has signed up for the trip of a lifetime: a series of dives deep into the pitch-black waters of Saturn’s moon, Enceladus. </p> <p>Set in the near-future when global climate catastrophe has forced humans to search for solutions on new planets, <i>The Sea in the Sky</i> chronicles two astronauts’ journey, in what could be the final NASA-sponsored mission to space. In their search for life, Bee and Ty navigate uncharted waters, take on incredible risks and confront difficult truths about themselves. What will they find at the bottom of it all? </p> <p>At times epic and intimate, laugh-out-loud funny and achingly soulful, <i>The Sea in the Sky</i> plumbs the depths of science and faith, triumph and failure. The Audible Original drama is told via daily "dispatches" sent from the space shuttle back to Earth, together with original music and sound design, a never-before-heard space rap, and a full cast of actors. </p> <p>Dive into a world you need to hear to believe. </p> <p><i>Contains sensitive content. </i></p> <p>This original podcast is 12 episodes; please begin with the episode titled "Prologue". </p> <p>Note: this title contains fully immersive sound design and original composition. In order to enjoy the highest quality audio listening experience, please use headphones. If you choose to download this title, make sure it’s set to “High” in your settings.</p>',
		rating: {
			num_reviews: 621,
			overall_distribution: {
				average_rating: 4.49203659776347,
				display_average_rating: '4.5',
				display_stars: 4.5,
				num_five_star_ratings: 2057,
				num_four_star_ratings: 530,
				num_one_star_ratings: 74,
				num_ratings: 2951,
				num_three_star_ratings: 197,
				num_two_star_ratings: 93
			},
			performance_distribution: {
				average_rating: 4.680525941719972,
				display_average_rating: '4.7',
				display_stars: 4.5,
				num_five_star_ratings: 2260,
				num_four_star_ratings: 351,
				num_one_star_ratings: 49,
				num_ratings: 2814,
				num_three_star_ratings: 110,
				num_two_star_ratings: 44
			},
			story_distribution: {
				average_rating: 4.415026833631485,
				display_average_rating: '4.4',
				display_stars: 4.5,
				num_five_star_ratings: 1845,
				num_four_star_ratings: 551,
				num_one_star_ratings: 91,
				num_ratings: 2795,
				num_three_star_ratings: 204,
				num_two_star_ratings: 104
			}
		},
		read_along_support: 'false',
		release_date: '2020-10-01',
		sku: 'PD_30L0_000001',
		sku_lite: 'PD_30L0_000001',
		social_media_images: {
			facebook:
				'https://m.media-amazon.com/images/I/51izwaIIZ2L._SL10_UR1600,800_CR200,50,1200,630_CLa%7C1200,630%7C51izwaIIZ2L.jpg%7C0,0,1200,630+82,82,465,465_PJAdblSocialShare-Gradientoverlay-largeasin-0to70,TopLeft,0,0_PJAdblSocialShare-AudibleLogo-Large,TopLeft,600,270_OU01_ZBLISTENING%20ON,617,216,52,500,AudibleSansMd,30,255,255,255_PJAdblSocialShare-PodcastIcon-Small,TopLeft,1094,50.jpg',
			twitter:
				'https://m.media-amazon.com/images/I/51izwaIIZ2L._SL10_UR1600,800_CR200,50,1024,512_CLa%7C1024,512%7C51izwaIIZ2L.jpg%7C0,0,1024,512+67,67,376,376_PJAdblSocialShare-Gradientoverlay-twitter-largeasin-0to60,TopLeft,0,0_PJAdblSocialShare-AudibleLogo-Medium,TopLeft,490,223_OU01_ZBLISTENING%20ON,483,152,55,450,AudibleSansMd,32,255,255,255_PJAdblSocialShare-PodcastIcon-Small,TopLeft,929,45.jpg'
		},
		thesaurus_subject_keywords: [
			'podcast_fiction',
			'audible_original',
			'podcast_science_fiction',
			'podcast_show'
		],
		title: 'The Sea in the Sky'
	},
	response_groups: [
		'product_desc',
		'always-returned',
		'product_extended_attrs',
		'contributors',
		'series',
		'rating',
		'category_ladders',
		'media',
		'product_attrs',
		'product_details'
	]
})

export const podcastWithoutProgramParticipation = AudibleProductSchema.parse({
	product: {
		asin: 'B09X27Z3QL',
		asset_details: [],
		authors: [{ name: 'Test Author' }],
		category_ladders: [
			{
				ladder: [{ id: '18580606011', name: 'Science Fiction & Fantasy' }],
				root: 'Genres'
			}
		],
		content_delivery_type: 'PodcastParent',
		content_type: 'Podcast',
		continuity: 'serial',
		copyright: '©2024 Test Publisher',
		episode_count: 5,
		extended_product_description: 'A test podcast without program participation field',
		format_type: 'original_recording',
		has_children: true,
		is_adult_product: false,
		is_listenable: true,
		is_pdf_url_available: false,
		is_purchasability_suppressed: false,
		is_vvab: false,
		issue_date: '2024-01-15',
		language: 'english',
		merchandising_description: 'A test podcast without program participation',
		merchandising_summary: 'A test podcast without program participation field',
		narrators: [{ name: 'Test Narrator' }],
		new_episode_added_date: '2024-01-15T10:00:00.000Z',
		platinum_keywords: ['test', 'podcast'],
		product_images: {
			'500': 'https://m.media-amazon.com/images/I/51test._SL500_.jpg'
		},
		product_site_launch_date: '2024-01-15T07:00:00Z',
		// NOTE: program_participation field is intentionally missing
		publication_datetime: '2024-01-15T07:00:00Z',
		publisher_name: 'Test Publisher',
		publisher_summary: '<p>A test podcast without program participation field</p>',
		rating: {
			num_reviews: 0,
			overall_distribution: {
				average_rating: 0,
				display_average_rating: '0.0',
				display_stars: 0,
				num_five_star_ratings: 0,
				num_four_star_ratings: 0,
				num_one_star_ratings: 0,
				num_ratings: 0,
				num_three_star_ratings: 0,
				num_two_star_ratings: 0
			},
			performance_distribution: {
				average_rating: 0,
				display_average_rating: '0.0',
				display_stars: 0,
				num_five_star_ratings: 0,
				num_four_star_ratings: 0,
				num_one_star_ratings: 0,
				num_ratings: 0,
				num_three_star_ratings: 0,
				num_two_star_ratings: 0
			},
			story_distribution: {
				average_rating: 0,
				display_average_rating: '0.0',
				display_stars: 0,
				num_five_star_ratings: 0,
				num_four_star_ratings: 0,
				num_one_star_ratings: 0,
				num_ratings: 0,
				num_three_star_ratings: 0,
				num_two_star_ratings: 0
			}
		},
		read_along_support: 'false',
		release_date: '2024-01-15',
		sku: 'PD_TEST_000001',
		sku_lite: 'PD_TEST_000001',
		social_media_images: {
			facebook:
				'https://m.media-amazon.com/images/I/51test._SL10_UR1600,800_CR200,50,1200,630_CLa%7C1200,630%7C51test.jpg%7C0,0,1200,630'
		},
		thesaurus_subject_keywords: ['test_podcast'],
		title: 'Test Podcast Without Program Participation'
	},
	response_groups: [
		'product_desc',
		'always-returned',
		'product_extended_attrs',
		'contributors',
		'series',
		'rating',
		'category_ladders',
		'media',
		'product_attrs',
		'product_details'
	]
})

export const minimalB0036I54I6: ApiBook = {
	asin: 'B0036I54I6',
	authors: [
		{ name: 'Diane Wood Middlebrook (Professor of English' },
		{ name: 'Stanford University)' },
		{ name: 'Herbert Lindenberger (Avalon Foundation Professor of Humanities' },
		{ name: 'Comparative Literature' }
	],
	copyright: 1993,
	description:
		'Both Anne Sexton and Sylvia Plath rose above severe mental disorders to create bold new directions...',
	formatType: 'unabridged',
	genres: [
		{
			asin: '18574426011',
			name: 'Literature & Fiction',
			type: 'genre'
		},
		{ asin: '18574449011', name: 'Classics', type: 'tag' },
		{ asin: '18574505011', name: 'Poetry', type: 'tag' }
	],
	image: 'https://m.media-amazon.com/images/I/41dNQts9Z7L.jpg',
	isAdult: false,
	isbn: '',
	language: 'english',
	literatureType: 'nonfiction',
	narrators: [],
	publisherName: 'Stanford Audio',
	rating: '3.9',
	region: 'us',
	releaseDate: new Date('1999-12-16T00:00:00.000Z'),
	runtimeLengthMin: 114,
	summary:
		'Both Anne Sexton and Sylvia Plath rose above severe mental disorders to create bold new directions for American poetry and share the woman\'s perspective in distinct, powerful voices. Professor Middlebrook, author of the best selling <i>Anne Sexton: A Biography</i>, sheds light on the unique and important contributions of these poets by examining 4 works: "Morning Song" and "Ariel" by Plath and "The Fortress" and "The Double Image" by Sexton. Her conversations with Professor Lindenberger and an audience further delve into the work and lives of these women, their friendship, and their tragic deaths.',
	title: 'The Poetry of Anne Sexton and Sylvia Plath'
}

// Book without social_media_images field - tests optional schema
export const B0GFYFCX3D = AudibleProductSchema.parse({
	product: {
		asin: 'B0GFYFCX3D',
		asset_details: [],
		authors: [
			{
				asin: 'B000AP9A6K',
				name: 'Test Author'
			}
		],
		available_codecs: [
			{
				enhanced_codec: 'LC_128_44100_stereo',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'aax_44_128'
			}
		],
		category_ladders: [
			{
				ladder: [
					{
						id: '18574426011',
						name: 'Literature & Fiction'
					}
				],
				root: 'Genres'
			}
		],
		content_delivery_type: 'SinglePartBook',
		content_type: 'Product',
		copyright: '©2024 Test Author (P)2024 Audible Studios',
		date_first_available: '2024-01-15',
		extended_product_description: '<p>A test book without social media images field.</p>',
		format_type: 'unabridged',
		has_children: false,
		is_adult_product: false,
		is_listenable: true,
		is_pdf_url_available: false,
		is_purchasability_suppressed: false,
		is_vvab: false,
		isbn: '9781234567890',
		issue_date: '2024-01-15',
		language: 'english',
		merchandising_description: '',
		merchandising_summary: '<p>A test book without social media images field.</p>',
		narrators: [
			{
				name: 'Test Narrator'
			}
		],
		platinum_keywords: ['test', 'fiction'],
		product_images: {
			'1024': 'https://m.media-amazon.com/images/I/91test123._SL1024_.jpg',
			'500': 'https://m.media-amazon.com/images/I/51test456._SL500_.jpg'
		},
		product_site_launch_date: '2024-01-15T00:00:00Z',
		publication_datetime: '2024-01-15T08:00:00Z',
		publisher_name: 'Test Publisher',
		publisher_summary: '<p>A test book without social media images field.</p>',
		rating: {
			num_reviews: 10,
			overall_distribution: {
				average_rating: 4.5,
				display_average_rating: '4.5',
				display_stars: 5.0,
				num_five_star_ratings: 5,
				num_four_star_ratings: 3,
				num_one_star_ratings: 0,
				num_ratings: 10,
				num_three_star_ratings: 2,
				num_two_star_ratings: 0
			},
			performance_distribution: {
				average_rating: 4.6,
				display_average_rating: '4.6',
				display_stars: 5.0,
				num_five_star_ratings: 6,
				num_four_star_ratings: 2,
				num_one_star_ratings: 0,
				num_ratings: 10,
				num_three_star_ratings: 2,
				num_two_star_ratings: 0
			},
			story_distribution: {
				average_rating: 4.4,
				display_average_rating: '4.4',
				display_stars: 4.5,
				num_five_star_ratings: 4,
				num_four_star_ratings: 4,
				num_one_star_ratings: 0,
				num_ratings: 10,
				num_three_star_ratings: 2,
				num_two_star_ratings: 0
			}
		},
		read_along_support: 'false',
		release_date: '2024-01-15',
		runtime_length_min: 300,
		sku: 'BK_TEST_000001',
		sku_lite: 'BK_TEST_000001',
		// NOTE: social_media_images field is intentionally missing
		thesaurus_subject_keywords: ['test'],
		title: 'Test Book Without Social Media Images'
	},
	response_groups: [
		'product_desc',
		'always-returned',
		'product_extended_attrs',
		'contributors',
		'series',
		'rating',
		'category_ladders',
		'media',
		'product_attrs',
		'product_details'
	]
})

// Test data for ASINs missing content_delivery_type - tests fallback logic
// NOTE: content_delivery_type field is intentionally missing - schema validation skipped
export const bookWithoutContentDeliveryType = {
	product: {
		asin: 'B0GM8R53L2',
		asset_details: [],
		authors: [
			{
				asin: 'B000AP9A6K',
				name: 'Test Author 1'
			}
		],
		available_codecs: [
			{
				enhanced_codec: 'LC_128_44100_stereo',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'aax_44_128'
			}
		],
		category_ladders: [
			{
				ladder: [
					{
						id: '18574426011',
						name: 'Literature & Fiction'
					}
				],
				root: 'Genres'
			}
		],
		content_type: 'Product',
		copyright: '©2024 Test Publisher (P)2024 Audible Studios',
		date_first_available: '2024-02-01',
		extended_product_description: '<p>A test book missing content_delivery_type field.</p>',
		format_type: 'unabridged',
		has_children: false,
		is_adult_product: false,
		is_listenable: true,
		is_pdf_url_available: false,
		is_purchasability_suppressed: false,
		is_vvab: false,
		isbn: '9781234567891',
		issue_date: '2024-02-01',
		language: 'english',
		merchandising_description: '',
		merchandising_summary: '<p>A test book missing content_delivery_type field.</p>',
		narrators: [
			{
				name: 'Test Narrator 1'
			}
		],
		platinum_keywords: ['test', 'fiction'],
		product_images: {
			'1024': 'https://m.media-amazon.com/images/I/91test124._SL1024_.jpg',
			'500': 'https://m.media-amazon.com/images/I/51test457._SL500_.jpg'
		},
		product_site_launch_date: '2024-02-01T00:00:00Z',
		publication_datetime: '2024-02-01T08:00:00Z',
		publisher_name: 'Test Publisher 1',
		publisher_summary: '<p>A test book missing content_delivery_type field.</p>',
		rating: {
			num_reviews: 5,
			overall_distribution: {
				average_rating: 4.0,
				display_average_rating: '4.0',
				display_stars: 4.0,
				num_five_star_ratings: 2,
				num_four_star_ratings: 2,
				num_one_star_ratings: 0,
				num_ratings: 5,
				num_three_star_ratings: 1,
				num_two_star_ratings: 0
			},
			performance_distribution: {
				average_rating: 4.2,
				display_average_rating: '4.2',
				display_stars: 4.5,
				num_five_star_ratings: 3,
				num_four_star_ratings: 1,
				num_one_star_ratings: 0,
				num_ratings: 5,
				num_three_star_ratings: 1,
				num_two_star_ratings: 0
			},
			story_distribution: {
				average_rating: 3.8,
				display_average_rating: '3.8',
				display_stars: 4.0,
				num_five_star_ratings: 1,
				num_four_star_ratings: 3,
				num_one_star_ratings: 0,
				num_ratings: 5,
				num_three_star_ratings: 1,
				num_two_star_ratings: 0
			}
		},
		read_along_support: 'false',
		release_date: '2024-02-01',
		runtime_length_min: 240,
		sku: 'BK_TEST_000002',
		sku_lite: 'BK_TEST_000002',
		social_media_images: {
			facebook:
				'https://m.media-amazon.com/images/I/51test457._SL10_UR1600,800_CR200,50,1200,630_CLa%7C1200,630%7C51test457.jpg%7C0,0,1200,630'
		},
		thesaurus_subject_keywords: ['test'],
		title: 'Test Book Without Content Delivery Type'
	},
	response_groups: [
		'product_desc',
		'always-returned',
		'product_extended_attrs',
		'contributors',
		'series',
		'rating',
		'category_ladders',
		'media',
		'product_attrs',
		'product_details'
	]
}
