import { ObjectId, WithId } from 'mongodb'

import { BookDocument } from '#config/models/Book'
import { ApiBook, ApiBookSchema, ApiGenreSchema, AudibleProductSchema } from '#config/types'

// Reusable
const _id = new ObjectId('5c8f8f8f8f8f8f8f8f8f8f8f')
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
const copyright = 2017
const description =
	'On the edge of the galaxy, a diplomatic mission to an alien planet takes a turn when the Legionnaires, an elite special fighting force, find themselves ambushed and stranded behind enemy lines. They struggle to survive under siege, waiting on a rescue that might never come....'
const formatType = 'unabridged'
const image = 'https://m.media-amazon.com/images/I/91spdScZuIL.jpg'
const isAdult = false
const isbn = '9781772305241'
const language = 'english'
const literatureType = 'fiction'
const narrators = [
	{
		name: 'R.C. Bray'
	}
]
const publisherName = 'Podium Audio'
const rating = '4.5'
const region = 'us'
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

const genresArr = [
	{
		asin: '18580606011',
		name: 'Science Fiction & Fantasy',
		type: 'genre'
	},
	{
		asin: '18580628011',
		name: 'Science Fiction',
		type: 'tag'
	},
	{ asin: '18580641011', name: 'Military', type: 'tag' }
]

const genres = genresArr.map((genre) => ApiGenreSchema.parse(genre))

export const genresObject = {
	genres: [genresArr[0], genresArr[2]]
}

export const genresWithoutAsin = {
	genres: [
		{
			name: 'Science Fiction & Fantasy',
			type: 'genre'
		},
		{ name: 'Military', type: 'tag' }
	]
}

export const htmlResponse =
	'<div id="center-9" class="slot centerSlot">\
<div class="bc-container product-topic-tags">\
    <span>\
        <ul\
            class="bc-list bc-spacing-s3 bc-color-secondary bc-list-nostyle"\
        >\
            <li class="bc-list-item seriesLabel">\
                Series:\
\
                <a\
                    class="bc-link bc-color-link"\
                    tabindex="0"\
                    href="/series/Galaxys-Edge-Series-Audiobooks/B079YXK1GL?ref=a_pd_Galaxy_c9_series_1&pf_rd_p=185bc0d6-e1e0-4345-b88d-545c324f8afa&pf_rd_r=S2EP595FDGG6ANXWB059"\
                    >Galaxy\'s Edge Series</a\
                >, Book 1-2\
            </li>\
\
            <li class="bc-list-item format">Unabridged Audiobook</li>\
\
            <li class="bc-list-item categoriesLabel">\
                Categories:\
\
                <a\
                    class="bc-link bc-size-base bc-color-link"\
                    tabindex="0"\
                    href="/cat/Science-Fiction-Fantasy-Audiobooks/18580606011?ref=a_pd_Galaxy_c9_bc&pf_rd_p=185bc0d6-e1e0-4345-b88d-545c324f8afa&pf_rd_r=S2EP595FDGG6ANXWB059"\
                    >Science Fiction & Fantasy</a\
                >\
            </li>\
        </ul>\
    </span>\
\
    <style type="text/css">\
        .bc-expander.bc-expander-52.bc-expander-collapsed\
            > .bc-expander-content {\
            max-height: 52px;\
        }\
    </style>\
\
    <div\
        data-bc-expander-collapsed-height="52"\
        class="bc-expander bc-expander-type-partial-collapse bc-expander-collapsed bc-spacing-s4 bc-expander-52"\
    >\
        <div class="bc-expander-content">\
            <div class="bc-section bc-chip-group" style="">\
                <span class="bc-chip-wrapper">\
                    <span class="bc-chip-tap-target" role="button">\
                        <a\
                            href="/cat/Science-Fiction/Military-Audiobooks/18580641011?ref=a_pd_Galaxy_c9_topic-tags_1&pf_rd_p=185bc0d6-e1e0-4345-b88d-545c324f8afa&pf_rd_r=S2EP595FDGG6ANXWB059"\
                        >\
                            <span\
                                class="bc-chip bc-chip-outline bc-chip-button"\
                            >\
                                <span\
                                    class="bc-chip-text"\
                                    data-text="Military"\
                                >\
                                    Military\
                                </span>\
\
                                <span class="bc-chip-border"></span>\
                            </span>\
                        </a>\
                    </span>\
                </span>\
            </div>\
        </div>\
\
        <a\
            class="bc-link bc-expander-toggle bc-color-base"\
            tabindex="0"\
            role="button"\
        >\
            <span class="bc-expander-show-when-collapsed">\
                Show more\
\
                <i\
                    style="vertical-align: middle"\
                    aria-hidden="true"\
                    class="bc-icon bc-icon-fill-base bc-icon-caret-down-s2 bc-icon-caret-down bc-icon-size-s2 bc-color-base"\
                >\
                </i>\
            </span>\
\
            <span class="bc-expander-show-when-expanded">\
                Show less\
\
                <i\
                    style="vertical-align: middle"\
                    aria-hidden="true"\
                    class="bc-icon bc-icon-fill-base bc-icon-caret-up-s2 bc-icon-caret-up bc-icon-size-s2 bc-color-base"\
                >\
                </i>\
            </span>\
        </a>\
    </div>\
</div>\
</div>\
'

export const apiResponse = AudibleProductSchema.parse({
	product: {
		asin: 'B079LRSMNN',
		asset_details: [],
		authors: [
			{
				asin: 'B012DQ3BCM',
				name: 'Jason Anspach'
			},
			{
				asin: 'B004W47QXE',
				name: 'Nick Cole'
			}
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
						id: '18580641011',
						name: 'Military'
					}
				],
				root: 'Genres'
			}
		],
		content_delivery_type: 'MultiPartBook',
		content_type: 'Product',
		copyright:
			'©2017 Nick Cole; 2018 Podium Publishing; 2017 Jason Anspach (P)2018 Podium Publishing',
		date_first_available: '2018-02-20',
		extended_product_description:
			"<p>On the edge of the galaxy, a diplomatic mission to an alien planet takes a turn when the Legionnaires, an elite special fighting force, find themselves ambushed and stranded behind enemy lines. They struggle to survive under siege, waiting on a rescue that might never come. In the seedy starport of Ackabar, a young girl searches the crime-ridden gutters to avenge her father's murder; not far away, a double-dealing legionniare-turned-smuggler hunts an epic payday; and somewhere along the outer galaxy, a mysterious bounty hunter lies in wait.</p>",
		format_type: 'unabridged',
		has_children: true,
		is_adult_product: false,
		is_listenable: true,
		is_pdf_url_available: false,
		is_purchasability_suppressed: false,
		is_vvab: false,
		isbn: '9781772305241',
		issue_date: '2018-02-20',
		language: 'english',
		merchandising_description: '',
		merchandising_summary:
			'<p>On the edge of the galaxy, a diplomatic mission to an alien planet takes a turn when the Legionnaires, an elite special fighting force, find themselves ambushed and stranded behind enemy lines. They struggle to survive under siege, waiting on a rescue that might never come....</p>',
		narrators: [
			{
				name: 'R.C. Bray'
			}
		],
		platinum_keywords: [
			'Science_Fiction_Fantasy/Science_Fiction',
			'Science_Fiction_Fantasy',
			'Sci-Fi_Fantasy/Military_Sci-Fi'
		],
		product_images: {
			'1024': 'https://m.media-amazon.com/images/I/91spdScZuIL._SL1024_.jpg',
			'500': 'https://m.media-amazon.com/images/I/51OIn2FgdtL._SL500_.jpg'
		},
		product_site_launch_date: '2018-02-05T17:19:00Z',
		publication_datetime: '2018-02-20T08:00:00Z',
		publication_name: "Galaxy's Edge Series",
		publisher_name: 'Podium Audio',
		publisher_summary:
			"<p><i>Galaxy's Edge </i>contains <i>Legionnaire </i>through to the end of <i>Galactic Outlaws</i>. </p> <p>On the edge of the galaxy, a diplomatic mission to an alien planet takes a turn when the Legionnaires, an elite special fighting force, find themselves ambushed and stranded behind enemy lines. They struggle to survive under siege, waiting on a rescue that might never come.</p> <p>In the seedy starport of Ackabar, a young girl searches the crime-ridden gutters to avenge her father's murder; not far away, a double-dealing legionniare-turned-smuggler hunts an epic payday; and somewhere along the outer galaxy, a mysterious bounty hunter lies in wait.</p> <p><i>Galaxy's Edge</i> combines sleek starfighters, exotic aliens, loyal bots, blasters, scoundrels, heroes, and powerful enemies in a thrilling adventure that will take you back to that magic place from a long time ago.</p>",
		rating: {
			num_reviews: 1727,
			overall_distribution: {
				average_rating: 4.53011688634668,
				display_average_rating: '4.5',
				display_stars: 4.5,
				num_five_star_ratings: 13753,
				num_four_star_ratings: 4256,
				num_one_star_ratings: 277,
				num_ratings: 20105,
				num_three_star_ratings: 1374,
				num_two_star_ratings: 445
			},
			performance_distribution: {
				average_rating: 4.821206267439365,
				display_average_rating: '4.8',
				display_stars: 5.0,
				num_five_star_ratings: 16052,
				num_four_star_ratings: 2055,
				num_one_star_ratings: 73,
				num_ratings: 18636,
				num_three_star_ratings: 383,
				num_two_star_ratings: 73
			},
			story_distribution: {
				average_rating: 4.429425064599483,
				display_average_rating: '4.4',
				display_stars: 4.5,
				num_five_star_ratings: 11841,
				num_four_star_ratings: 4158,
				num_one_star_ratings: 367,
				num_ratings: 18576,
				num_three_star_ratings: 1657,
				num_two_star_ratings: 553
			}
		},
		read_along_support: 'false',
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
		title: "Galaxy's Edge"
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

export const parsedBook = ApiBookSchema.parse({
	asin,
	authors,
	copyright,
	description,
	formatType,
	genres,
	image,
	isAdult,
	isbn,
	language,
	literatureType,
	narrators,
	publisherName,
	rating,
	region,
	releaseDate,
	runtimeLengthMin,
	seriesPrimary,
	summary,
	title
})

export const parsedBookWithGenres = ApiBookSchema.parse({
	...parsedBook,
	genres
})

export const parsedBookWithoutNarrators = ApiBookSchema.parse({
	...parsedBook,
	narrators: []
})

export const changedParsedBook: ApiBook = {
	...parsedBook,
	summary: ''
}

const bookWithIdInternal: WithId<ApiBook> = {
	_id,
	...parsedBook
}

export const bookWithId = (): WithId<ApiBook> => {
	return {
		_id,
		...parsedBook
	}
}

export const bookWithoutProjection: BookDocument = {
	...bookWithIdInternal,
	createdAt: new Date('2018-02-20T00:00:00.000Z'),
	updatedAt: new Date('2018-02-20T00:00:00.000Z')
}

export const bookWithoutProjectionUpdatedNow: BookDocument = {
	...bookWithIdInternal,
	createdAt: new Date('2018-02-20T00:00:00.000Z'),
	updatedAt: new Date(Date.now())
}

export const parsedBookWithoutGenres: ApiBook = {
	asin,
	authors,
	copyright,
	description,
	formatType,
	image,
	isAdult,
	isbn,
	language,
	literatureType,
	narrators,
	publisherName,
	rating,
	region,
	releaseDate,
	runtimeLengthMin,
	seriesPrimary,
	summary,
	title
}

const bookWithoutGenresWithIdInternal: WithId<ApiBook> = {
	_id,
	...parsedBookWithoutGenres
}

export const bookWithoutGenresWithoutProjection: BookDocument = {
	...bookWithoutGenresWithIdInternal,
	createdAt: new Date('2018-02-20T00:00:00.000Z'),
	updatedAt: new Date('2018-02-20T00:00:00.000Z')
}
