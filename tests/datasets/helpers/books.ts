import { ObjectId } from 'mongodb'

import { BookDocument } from '#config/models/Book'
import { AudibleProduct } from '#config/typing/audible'
import { ApiBook } from '#config/typing/books'

// Reusable
const asin = 'B079LRSMNN'
const authors = [
	{
		asin: 'B012DQ3BCM',
		name: 'Jason Anspach'
	},
	{
		asin: 'B004W47QXE',
		name: 'Nick Cole'
	}
]
const description =
	'On the edge of the galaxy, a diplomatic mission to an alien planet takes a turn when the Legionnaires, an elite special fighting force, find themselves ambushed and stranded behind enemy lines. They struggle to survive under siege, waiting on a rescue that might never come....'
const formatType = 'unabridged'
const image = 'https://m.media-amazon.com/images/I/91spdScZuIL.jpg'
const language = 'english'
const narrators = [
	{
		name: 'R.C. Bray'
	}
]
const publisherName = 'Podium Audio'
const rating = '4.5'
const releaseDate = new Date('2018-02-20T00:00:00.000Z')
const runtimeLengthMin = 1042
const seriesPrimary = {
	asin: 'B079YXK1GL',
	name: "Galaxy's Edge Series",
	position: '1-2'
}
const summary =
	"<p><i>Galaxy's Edge </i>contains <i>Legionnaire </i>through to the end of <i>Galactic Outlaws</i>. </p> <p>On the edge of the galaxy, a diplomatic mission to an alien planet takes a turn when the Legionnaires, an elite special fighting force, find themselves ambushed and stranded behind enemy lines. They struggle to survive under siege, waiting on a rescue that might never come.</p> <p>In the seedy starport of Ackabar, a young girl searches the crime-ridden gutters to avenge her father's murder; not far away, a double-dealing legionniare-turned-smuggler hunts an epic payday; and somewhere along the outer galaxy, a mysterious bounty hunter lies in wait.</p> <p><i>Galaxy's Edge</i> combines sleek starfighters, exotic aliens, loyal bots, blasters, scoundrels, heroes, and powerful enemies in a thrilling adventure that will take you back to that magic place from a long time ago.</p>"
const title = "Galaxy's Edge"

export const apiResponse: AudibleProduct = {
	product: {
		asin: 'B079LRSMNN',
		authors: [
			{ asin: 'B012DQ3BCM', name: 'Jason Anspach' },
			{ asin: 'B004W47QXE', name: 'Nick Cole' }
		],
		available_codecs: [
			{
				enhanced_codec: 'format4',
				format: 'Format4',
				is_kindle_enhanced: false,
				name: 'format4'
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
				enhanced_codec: 'mp42232',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'mp4_22_32'
			},
			{
				enhanced_codec: 'piff2264',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'piff_22_64'
			},
			{
				enhanced_codec: 'piff2232',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'piff_22_32'
			},
			{
				enhanced_codec: 'mp42264',
				format: 'Enhanced',
				is_kindle_enhanced: true,
				name: 'mp4_22_64'
			},
			{
				enhanced_codec: 'aax',
				format: 'Enhanced',
				is_kindle_enhanced: false,
				name: 'aax'
			}
		],
		content_delivery_type: 'MultiPartBook',
		content_type: 'Product',
		format_type: 'unabridged',
		has_children: true,
		is_adult_product: false,
		is_listenable: true,
		is_purchasability_suppressed: false,
		issue_date: '2018-02-20',
		language: 'english',
		merchandising_summary:
			'<p>On the edge of the galaxy, a diplomatic mission to an alien planet takes a turn when the Legionnaires, an elite special fighting force, find themselves ambushed and stranded behind enemy lines. They struggle to survive under siege, waiting on a rescue that might never come....</p>',
		narrators: [{ name: 'R.C. Bray' }],
		product_images: {
			'500': 'https://m.media-amazon.com/images/I/51OIn2FgdtL._SL500_.jpg',
			'1024': 'https://m.media-amazon.com/images/I/91spdScZuIL._SL1024_.jpg'
		},
		publication_name: seriesPrimary.name,
		publisher_name: publisherName,
		publisher_summary: summary,
		rating: {
			num_reviews: 1556,
			overall_distribution: {
				average_rating: 4.525123735743491,
				display_average_rating: '4.5',
				display_stars: 4.5,
				num_five_star_ratings: 12664,
				num_four_star_ratings: 3960,
				num_one_star_ratings: 262,
				num_ratings: 18588,
				num_three_star_ratings: 1287,
				num_two_star_ratings: 415
			},
			performance_distribution: {
				average_rating: 4.819587628865979,
				display_average_rating: '4.8',
				display_stars: 5,
				num_five_star_ratings: 14856,
				num_four_star_ratings: 1911,
				num_one_star_ratings: 68,
				num_ratings: 17266,
				num_three_star_ratings: 361,
				num_two_star_ratings: 70
			},
			story_distribution: {
				average_rating: 4.421725239616613,
				display_average_rating: '4.4',
				display_stars: 4.5,
				num_five_star_ratings: 10901,
				num_four_star_ratings: 3886,
				num_one_star_ratings: 349,
				num_ratings: 17215,
				num_three_star_ratings: 1564,
				num_two_star_ratings: 515
			}
		},
		release_date: '2018-02-20',
		runtime_length_min: 1042,
		series: [
			{
				asin: 'B079YXK1GL',
				sequence: '1-2',
				title: "Galaxy's Edge Series",
				url: '/pd/Galaxys-Edge-Series-Audiobook/B079YXK1GL'
			}
		],
		sku: 'BK_PODM_001103',
		sku_lite: 'BK_PODM_001103',
		social_media_images: {
			facebook:
				'https://m.media-amazon.com/images/I/51OIn2FgdtL._SL10_UR1600,800_CR200,50,1200,630_CLa%7C1200,630%7C51OIn2FgdtL.jpg%7C0,0,1200,630+82,82,465,465_PJAdblSocialShare-Gradientoverlay-largeasin-0to70,TopLeft,0,0_PJAdblSocialShare-AudibleLogo-Large,TopLeft,600,270_OU01_ZBLISTENING%20ON,617,216,52,500,AudibleSansMd,30,255,255,255.jpg',
			twitter:
				'https://m.media-amazon.com/images/I/51OIn2FgdtL._SL10_UR1600,800_CR200,50,1024,512_CLa%7C1024,512%7C51OIn2FgdtL.jpg%7C0,0,1024,512+67,67,376,376_PJAdblSocialShare-Gradientoverlay-twitter-largeasin-0to60,TopLeft,0,0_PJAdblSocialShare-AudibleLogo-Medium,TopLeft,490,223_OU01_ZBLISTENING%20ON,483,152,55,450,AudibleSansMd,32,255,255,255.jpg'
		},
		thesaurus_subject_keywords: ['literature-and-fiction'],
		title
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

export const parsedBook: ApiBook = {
	asin,
	authors,
	description,
	formatType,
	image,
	language,
	narrators,
	publisherName,
	rating,
	releaseDate,
	runtimeLengthMin,
	seriesPrimary,
	summary,
	title
}

export const changedParsedBook: ApiBook = {
	asin,
	authors,
	description,
	formatType,
	image,
	language,
	narrators,
	publisherName,
	rating,
	releaseDate,
	runtimeLengthMin,
	seriesPrimary,
	summary: '',
	title
}

export const bookWithoutProjection: BookDocument = {
	_id: new ObjectId('5c8f8f8f8f8f8f8f8f8f8f8f'),
	asin,
	authors,
	description,
	formatType,
	image,
	language,
	narrators,
	publisherName,
	rating,
	releaseDate,
	runtimeLengthMin,
	seriesPrimary,
	summary,
	title,
	createdAt: new Date('2018-02-20T00:00:00.000Z'),
	updatedAt: new Date('2018-02-20T00:00:00.000Z')
}

export const bookWithoutProjectionUpdatedNow: BookDocument = {
	_id: new ObjectId('5c8f8f8f8f8f8f8f8f8f8f8f'),
	asin,
	authors,
	description,
	formatType,
	image,
	language,
	narrators,
	publisherName,
	rating,
	releaseDate,
	runtimeLengthMin,
	seriesPrimary,
	summary,
	title,
	createdAt: new Date('2018-02-20T00:00:00.000Z'),
	updatedAt: new Date(Date.now())
}
