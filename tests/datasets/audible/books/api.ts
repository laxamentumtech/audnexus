import { AudibleProduct } from '#config/typing/audible'
import { ApiGenre, Book } from '#config/typing/books'

export interface MinimalResponse {
	asin: string
	authors: AudibleProduct['product']['authors']
	category_ladders: AudibleProduct['product']['category_ladders']
	merchandising_summary: AudibleProduct['product']['merchandising_summary']
	format_type: AudibleProduct['product']['format_type']
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
	description: string,
	image: string,
	genres: ApiGenre[]
): Book {
	return {
		asin: response.asin,
		authors: response.authors,
		description,
		formatType: response.format_type,
		genres,
		language: response.language,
		narrators: response.narrators,
		image,
		rating: response.rating.overall_distribution.display_average_rating.toString(),
		publisherName: response.publisher_name,
		summary: response.publisher_summary,
		releaseDate: new Date(response.release_date),
		runtimeLengthMin: response.runtime_length_min ?? 0,
		title: response.title,
		...(response.series?.[0] && {
			seriesPrimary: {
				asin: response.series[0].asin,
				name: response.series[0].title,
				position: response.series[0].sequence
			}
		}),
		...(response.series?.[1] && {
			seriesSecondary: {
				asin: response.series[1].asin,
				name: response.series[1].title,
				position: response.series[1].sequence
			}
		})
	}
}

export function setupMinimalResponse(response: AudibleProduct['product']): MinimalResponse {
	return {
		asin: response.asin,
		authors: response.authors,
		category_ladders: response.category_ladders,
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

export const B08G9PRS1K: AudibleProduct = {
	product: {
		asin: 'B08G9PRS1K',
		authors: [{ asin: 'B00G0WYW92', name: 'Andy Weir' }],
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
			{ enhanced_codec: 'format4', format: 'Format4', is_kindle_enhanced: false, name: 'format4' },
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
			{ enhanced_codec: 'aax', format: 'Enhanced', is_kindle_enhanced: false, name: 'aax' }
		],
		category_ladders: [
			{
				ladder: [
					{ id: '18580606011', name: 'Science Fiction & Fantasy' },
					{ id: '18580628011', name: 'Science Fiction' },
					{ id: '18580629011', name: 'Adventure' }
				],
				root: 'Genres'
			},
			{
				ladder: [
					{ id: '18580606011', name: 'Science Fiction & Fantasy' },
					{ id: '18580628011', name: 'Science Fiction' },
					{ id: '18580639011', name: 'Hard Science Fiction' }
				],
				root: 'Genres'
			},
			{
				ladder: [
					{ id: '18580606011', name: 'Science Fiction & Fantasy' },
					{ id: '18580628011', name: 'Science Fiction' },
					{ id: '18580645011', name: 'Space Opera' }
				],
				root: 'Genres'
			}
		],
		content_delivery_type: 'MultiPartBook',
		content_type: 'Product',
		format_type: 'unabridged',
		has_children: true,
		is_adult_product: false,
		is_listenable: true,
		is_purchasability_suppressed: false,
		issue_date: '2021-05-04',
		language: 'english',
		merchandising_summary:
			"<p>Ryland Grace is the sole survivor on a desperate, last-chance mission - and if he fails, humanity and the Earth itself will perish. Except that right now, he doesn't know that. He can't even remember his own name, let alone the nature of his assignment or how to complete it....</p>",
		narrators: [{ name: 'Ray Porter' }],
		product_images: {
			'500': 'https://m.media-amazon.com/images/I/51b6fvQr1-L._SL500_.jpg',
			'1024': 'https://m.media-amazon.com/images/I/91vS2L5YfEL._SL1024_.jpg'
		},
		publisher_name: 'Audible Studios',
		publisher_summary:
			"<p><b>Winner of the 2022 Audie Awards Audiobook of the Year.</b></p> <p><b>Number-One Audible and</b><b><i> New York Times</i></b><b> Audio Best Seller</b></p> <p><b>A lone astronaut must save the earth from disaster in this incredible new science-based thriller from the number-one </b><b><i>New York Times</i></b><b> best-selling author of </b><b><i>The Martian</i></b><b>.</b></p> <p>Ryland Grace is the sole survivor on a desperate, last-chance mission - and if he fails, humanity and the Earth itself will perish.</p> <p>Except that right now, he doesn't know that. He can't even remember his own name, let alone the nature of his assignment or how to complete it.</p> <p>All he knows is that he's been asleep for a very, very long time. And he's just been awakened to find himself millions of miles from home, with nothing but two corpses for company.</p> <p>His crewmates dead, his memories fuzzily returning, he realizes that an impossible task now confronts him. Alone on this tiny ship that's been cobbled together by every government and space agency on the planet and hurled into the depths of space, it's up to him to conquer an extinction-level threat to our species.</p> <p>And thanks to an unexpected ally, he just might have a chance.</p> <p>Part scientific mystery, part dazzling interstellar journey, <i>Project Hail Mary</i> is a tale of discovery, speculation, and survival to rival <i>The Martian</i> - while taking us to places it never dreamed of going.</p> <p>PLEASE NOTE: To accommodate this audio edition, some changes to the original text have been made with the approval of author Andy Weir.</p>",
		rating: {
			num_reviews: 13224,
			overall_distribution: {
				average_rating: 4.864404509607733,
				display_average_rating: '4.9',
				display_stars: 5,
				num_five_star_ratings: 113014,
				num_four_star_ratings: 11464,
				num_one_star_ratings: 217,
				num_ratings: 126929,
				num_three_star_ratings: 1823,
				num_two_star_ratings: 411
			},
			performance_distribution: {
				average_rating: 4.924969534696119,
				display_average_rating: '4.9',
				display_stars: 5,
				num_five_star_ratings: 109467,
				num_four_star_ratings: 5838,
				num_one_star_ratings: 141,
				num_ratings: 116526,
				num_three_star_ratings: 899,
				num_two_star_ratings: 181
			},
			story_distribution: {
				average_rating: 4.837987815911696,
				display_average_rating: '4.8',
				display_stars: 5,
				num_five_star_ratings: 100979,
				num_four_star_ratings: 12307,
				num_one_star_ratings: 237,
				num_ratings: 116053,
				num_three_star_ratings: 2043,
				num_two_star_ratings: 487
			}
		},
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
		'media',
		'product_attrs'
	]
}

export const minimalB08G9PRS1K: MinimalResponse = setupMinimalResponse(B08G9PRS1K.product)

export const B08C6YJ1LS: AudibleProduct = {
	product: {
		asin: 'B08C6YJ1LS',
		authors: [
			{ asin: 'B000APZGGS', name: 'James Patterson' },
			{ asin: 'B09MXLL1JR', name: 'Aaron Tracy' },
			{ asin: 'B07R2F2DXH', name: 'Ryan Silbert' }
		],
		available_codecs: [
			{ enhanced_codec: 'format4', format: 'Format4', is_kindle_enhanced: false, name: 'format4' },
			{
				enhanced_codec: 'LC_128_44100_stereo',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'aax_44_128'
			},
			{
				enhanced_codec: 'LC_64_44100_stereo',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'aax_44_64'
			},
			{
				enhanced_codec: 'mp44464',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'mp4_44_64'
			},
			{
				enhanced_codec: 'mp444128',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'mp4_44_128'
			},
			{ enhanced_codec: 'aax', format: 'Enhanced', is_kindle_enhanced: false, name: 'aax' }
		],
		category_ladders: [
			{
				ladder: [
					{ id: '18574597011', name: 'Mystery, Thriller & Suspense' },
					{ id: '18574621011', name: 'Thriller & Suspense' },
					{ id: '18574623011', name: 'Crime Thrillers' }
				],
				root: 'Genres'
			}
		],
		content_delivery_type: 'SinglePartBook',
		content_type: 'Show',
		format_type: 'original_recording',
		has_children: false,
		is_adult_product: false,
		is_listenable: true,
		is_purchasability_suppressed: false,
		issue_date: '2021-03-11',
		language: 'english',
		merchandising_summary:
			"<p>James Patterson's Detective Billy Harney is back, this time investigating murders in a notorious Chicago drug ring, which will lead him, his sister, and his new partner through a dangerous web of corrupt politicians, vengeful billionaires, and violent dark web conspiracies....   </p>",
		narrators: [
			{ name: 'Aaron Paul' },
			{ name: 'Krysten Ritter' },
			{ name: 'Nathalie Emmanuel' },
			{ name: 'Beau Bridges' },
			{ name: 'full cast' }
		],
		product_images: {
			'500': 'https://m.media-amazon.com/images/I/51SteOEMD8L._SL500_.jpg',
			'1024': 'https://m.media-amazon.com/images/I/91H9ynKGNwL._SL1024_.jpg'
		},
		program_participation: 'Audible Original',
		publication_name: 'A Billy Harney Thriller',
		publisher_name: 'Audible Originals',
		publisher_summary:
			"<p><b>Please note</b>: This audio drama is for mature audiences only. It contains strong language, violence, and sexual content. Discretion is advised. </p> <p><b>James Patterson's Detective Billy Harney is back, this time investigating murders in a notorious Chicago drug ring, which will lead him, his sister, and his new partner through a dangerous web of corrupt politicians, vengeful billionaires, and violent dark web conspiracies. </b></p> <p>In <i>The Coldest Case: A Black Book Audio Drama</i>, homicide detective Billy Harney sends his new partner, Kate, deep undercover in a notorious Chicago drug ring. When several members of the ring soon turn up dead, Billy abruptly pulls Kate out, blowing her cover. Kate’s informant inside the gang quickly disappears. As does the ring’s black book.... </p> <p>When Billy can’t find the informant, he wonders if Kate is secretly harboring her, since the two grew close during Kate's weeks undercover. As Billy and Kate investigate the ring’s murders, they’ll be pulled into a dangerous web of corrupt politicians, vengeful billionaires, drugged pro-athletes, and violent, dark web conspiracies, all in search of the missing black book. </p>",
		rating: {
			num_reviews: 1628,
			overall_distribution: {
				average_rating: 4.328910333735424,
				display_average_rating: '4.3',
				display_stars: 4.5,
				num_five_star_ratings: 11864,
				num_four_star_ratings: 4618,
				num_one_star_ratings: 590,
				num_ratings: 19896,
				num_three_star_ratings: 2098,
				num_two_star_ratings: 726
			},
			performance_distribution: {
				average_rating: 4.548000665520492,
				display_average_rating: '4.5',
				display_stars: 4.5,
				num_five_star_ratings: 13090,
				num_four_star_ratings: 2922,
				num_one_star_ratings: 386,
				num_ratings: 18031,
				num_three_star_ratings: 1215,
				num_two_star_ratings: 418
			},
			story_distribution: {
				average_rating: 4.239721059972106,
				display_average_rating: '4.2',
				display_stars: 4,
				num_five_star_ratings: 10031,
				num_four_star_ratings: 4248,
				num_one_star_ratings: 647,
				num_ratings: 17925,
				num_three_star_ratings: 2205,
				num_two_star_ratings: 794
			}
		},
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
		'media',
		'product_attrs'
	]
}

export const minimalB08C6YJ1LS: MinimalResponse = setupMinimalResponse(B08C6YJ1LS.product)

export const B017V4IM1G: AudibleProduct = {
	product: {
		asin: 'B017V4IM1G',
		authors: [{ asin: 'B000AP9A6K', name: 'J.K. Rowling' }],
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
			{ enhanced_codec: 'format4', format: 'Format4', is_kindle_enhanced: false, name: 'format4' },
			{
				enhanced_codec: 'mp42232',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'mp4_22_32'
			},
			{
				enhanced_codec: 'mp42264',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'mp4_22_64'
			},
			{ enhanced_codec: 'aax', format: 'Enhanced', is_kindle_enhanced: false, name: 'aax' }
		],
		category_ladders: [
			{ ladder: [{ id: '18572091011', name: "Children's Audiobooks" }], root: 'Genres' },
			{ ladder: [{ id: '18572091011', name: "Children's Audiobooks" }], root: 'Genres' },
			{
				ladder: [
					{ id: '18572091011', name: "Children's Audiobooks" },
					{ id: '18572491011', name: 'Literature & Fiction' },
					{ id: '18572505011', name: 'Family Life' }
				],
				root: 'Genres'
			},
			{
				ladder: [
					{ id: '18572091011', name: "Children's Audiobooks" },
					{ id: '18572586011', name: 'Science Fiction & Fantasy' },
					{ id: '18572587011', name: 'Fantasy & Magic' }
				],
				root: 'Genres'
			},
			{
				ladder: [
					{ id: '18580606011', name: 'Science Fiction & Fantasy' },
					{ id: '18580607011', name: 'Fantasy' }
				],
				root: 'Genres'
			}
		],
		content_delivery_type: 'SinglePartBook',
		content_type: 'Product',
		editorial_reviews: [
			'<p>"To call Dale a \'reader\' of books is like saying Monet was a Sunday painter." (<i>Los Angeles Times</i>)</p>'
		],
		format_type: 'unabridged',
		has_children: false,
		is_adult_product: false,
		is_listenable: true,
		is_purchasability_suppressed: false,
		issue_date: '2015-11-20',
		language: 'english',
		merchandising_summary:
			'<p>Harry Potter has never even heard of Hogwarts when the letters start dropping on the doormat at number four, Privet Drive. Addressed in green ink on yellowish parchment with a purple seal, they are swiftly confiscated by his grisly aunt and uncle....</p>',
		narrators: [{ name: 'Jim Dale' }],
		product_images: {
			'500': 'https://m.media-amazon.com/images/I/51xJbFMRsxL._SL500_.jpg',
			'1024': 'https://m.media-amazon.com/images/I/91eopoUCjLL._SL1024_.jpg'
		},
		publication_name: 'Harry Potter',
		publisher_name: 'Pottermore Publishing',
		publisher_summary:
			"<p>Turning the envelope over, his hand trembling, Harry saw a purple wax seal bearing a coat of arms; a lion, an eagle, a badger and a snake surrounding a large letter 'H'.</p> <p>Harry Potter has never even heard of Hogwarts when the letters start dropping on the doormat at number four, Privet Drive. Addressed in green ink on yellowish parchment with a purple seal, they are swiftly confiscated by his grisly aunt and uncle. Then, on Harry's eleventh birthday, a great beetle-eyed giant of a man called Rubeus Hagrid bursts in with some astonishing news: Harry Potter is a wizard, and he has a place at Hogwarts School of Witchcraft and Wizardry. An incredible adventure is about to begin!</p> <p>Having become classics of our time, the Harry Potter stories never fail to bring comfort and escapism. With their message of hope, belonging and the enduring power of truth and love, the story of the Boy Who Lived continues to delight generations of new listeners.    </p>",
		rating: {
			num_reviews: 6084,
			overall_distribution: {
				average_rating: 4.909541875069631,
				display_average_rating: '4.9',
				display_stars: 5,
				num_five_star_ratings: 158959,
				num_four_star_ratings: 9226,
				num_one_star_ratings: 560,
				num_ratings: 170543,
				num_three_star_ratings: 1433,
				num_two_star_ratings: 365
			},
			performance_distribution: {
				average_rating: 4.84958682081386,
				display_average_rating: '4.8',
				display_stars: 5,
				num_five_star_ratings: 134106,
				num_four_star_ratings: 11919,
				num_one_star_ratings: 616,
				num_ratings: 150419,
				num_three_star_ratings: 3092,
				num_two_star_ratings: 686
			},
			story_distribution: {
				average_rating: 4.9257108183079055,
				display_average_rating: '4.9',
				display_stars: 5,
				num_five_star_ratings: 141159,
				num_four_star_ratings: 7235,
				num_one_star_ratings: 280,
				num_ratings: 149968,
				num_three_star_ratings: 1096,
				num_two_star_ratings: 198
			}
		},
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
				title: 'Wizarding World',
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
		'media',
		'product_attrs'
	]
}

export const B07BS4RKGH = {
	product: {
		asin: 'B07BS4RKGH',
		authors: [{ asin: 'B019LK4QFY', name: 'Phil Price' }],
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
			{ enhanced_codec: 'format4', format: 'Format4', is_kindle_enhanced: false, name: 'format4' },
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
			{ enhanced_codec: 'aax', format: 'Enhanced', is_kindle_enhanced: false, name: 'aax' }
		],
		category_ladders: [],
		content_delivery_type: 'MultiPartBook',
		content_type: 'Product',
		editorial_reviews: [''],
		format_type: 'unabridged',
		has_children: true,
		is_adult_product: false,
		is_listenable: true,
		is_purchasability_suppressed: false,
		issue_date: '2018-03-29',
		language: 'english',
		merchandising_summary:
			"<p>It happens every year. A select few disappear, never to return. From The Falkland Islands to the Himalayas, people are vanishing without a trace. A young man who's lost everything stumbles across a secret. Can he unlock the mystery? Can he escape the Unknown? Listen to find out more....</p>",
		narrators: [{ name: 'Hannibal Hills' }],
		product_images: {
			'1024': 'https://m.media-amazon.com/images/I/91leOGfyEML._SL1024_.jpg',
			'500': 'https://m.media-amazon.com/images/I/61tD+Z-UVPL._SL500_.jpg'
		},
		publication_name: 'The Forsaken Series',
		publisher_name: 'Creativia Publishing',
		publisher_summary:
			"<p>It happens every year. A select few disappear, never to return. From The Falkland Islands to the Himalayas, Puerto Rico to England, people are vanishing without a trace or explanation. A young man who's lost everything stumbles across an ancient secret. Can he unlock the mystery? Will he find those who need him? Can he escape the Unknown?</p>",
		rating: {
			num_reviews: 16,
			overall_distribution: {
				average_rating: 4.078947368421052,
				display_average_rating: '4.1',
				display_stars: 4,
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
				display_stars: 4,
				num_five_star_ratings: 15,
				num_four_star_ratings: 13,
				num_one_star_ratings: 3,
				num_ratings: 38,
				num_three_star_ratings: 4,
				num_two_star_ratings: 3
			}
		},
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
		'media',
		'product_attrs'
	]
}

export const podcast: AudibleProduct = {
	product: {
		asin: 'B08JC5J5HR',
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
		episode_count: 12,
		format_type: 'original_recording',
		has_children: true,
		is_adult_product: false,
		is_listenable: false,
		is_purchasability_suppressed: true,
		issue_date: '2020-10-01',
		language: 'english',
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
		new_episode_added_date: '2020-12-24T18:49:57.049Z',
		product_images: {
			'500': 'https://m.media-amazon.com/images/I/51izwaIIZ2L._SL500_.jpg',
			'1024': 'https://m.media-amazon.com/images/I/9125JjSWeCL._SL1024_.jpg'
		},
		program_participation: 'Audible Original',
		publication_datetime: '2020-10-01T07:00:00Z',
		publisher_name: 'Audible Originals',
		publisher_summary:
			'<p>In this scripted Audible Original, wisecracking marine biologist and astronaut Bee Guerrero has signed up for the trip of a lifetime: a series of dives deep into the pitch-black waters of Saturn’s moon, Enceladus. </p> <p>Set in the near-future when global climate catastrophe has forced humans to search for solutions on new planets, <i>The Sea in the Sky</i> chronicles two astronauts’ journey, in what could be the final NASA-sponsored mission to space. In their search for life, Bee and Ty navigate uncharted waters, take on incredible risks and confront difficult truths about themselves. What will they find at the bottom of it all? </p> <p>At times epic and intimate, laugh-out-loud funny and achingly soulful, <i>The Sea in the Sky</i> plumbs the depths of science and faith, triumph and failure. The Audible Original drama is told via daily "dispatches" sent from the space shuttle back to Earth, together with original music and sound design, a never-before-heard space rap, and a full cast of actors. </p> <p>Dive into a world you need to hear to believe. </p> <p><i>Contains sensitive content. </i></p> <p>This original podcast is 12 episodes; please begin with the episode titled "Prologue". </p> <p>Note: this title contains fully immersive sound design and original composition. In order to enjoy the highest quality audio listening experience, please use headphones. If you choose to download this title, make sure it’s set to “High” in your settings.</p>',
		rating: {
			num_reviews: 517,
			overall_distribution: {
				average_rating: 4.489013184178985,
				display_average_rating: '4.5',
				display_stars: 4.5,
				num_five_star_ratings: 1743,
				num_four_star_ratings: 455,
				num_one_star_ratings: 65,
				num_ratings: 2503,
				num_three_star_ratings: 156,
				num_two_star_ratings: 84
			},
			performance_distribution: {
				average_rating: 4.677432885906041,
				display_average_rating: '4.7',
				display_stars: 4.5,
				num_five_star_ratings: 1909,
				num_four_star_ratings: 304,
				num_one_star_ratings: 40,
				num_ratings: 2384,
				num_three_star_ratings: 88,
				num_two_star_ratings: 43
			},
			story_distribution: {
				average_rating: 4.414799154334038,
				display_average_rating: '4.4',
				display_stars: 4.5,
				num_five_star_ratings: 1568,
				num_four_star_ratings: 462,
				num_one_star_ratings: 82,
				num_ratings: 2365,
				num_three_star_ratings: 165,
				num_two_star_ratings: 88
			}
		},
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
		'product_attrs'
	]
}

export const minimalB0036I54I6: Book = {
	asin: 'B0036I54I6',
	authors: [
		{ name: 'Diane Wood Middlebrook (Professor of English' },
		{ name: 'Stanford University)' },
		{ name: 'Herbert Lindenberger (Avalon Foundation Professor of Humanities' },
		{ name: 'Comparative Literature' }
	],
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
	language: 'english',
	narrators: [],
	publisherName: 'Stanford Audio',
	rating: '3.9',
	releaseDate: new Date('1999-12-16T00:00:00.000Z'),
	runtimeLengthMin: 114,
	summary:
		'Both Anne Sexton and Sylvia Plath rose above severe mental disorders to create bold new directions for American poetry and share the woman\'s perspective in distinct, powerful voices. Professor Middlebrook, author of the best selling <i>Anne Sexton: A Biography</i>, sheds light on the unique and important contributions of these poets by examining 4 works: "Morning Song" and "Ariel" by Plath and "The Fortress" and "The Double Image" by Sexton. Her conversations with Professor Lindenberger and an audience further delve into the work and lives of these women, their friendship, and their tragic deaths.',
	title: 'The Poetry of Anne Sexton and Sylvia Plath'
}
