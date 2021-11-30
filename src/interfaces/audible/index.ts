/* eslint-disable camelcase */
import { SeriesInterface } from '../books'
import { AuthorInterface, NarratorInterface } from '../people/index'

interface Codecs {
    enhanced_codec: string;
    format: string;
    is_kindle_enhanced: boolean;
    name: string
}

export interface GenreInterface {
    asin: string;
    name: string;
    type: string;
}

interface RatingItems {
    average_rating: number;
    display_average_rating: string;
    display_stars: number;
    num_five_star_ratings: number;
    num_four_star_ratings: number;
    num_one_star_ratings: number;
    num_ratings: number;
    num_three_star_ratings: number;
    num_two_star_ratings: number;
}

interface Ratings {
    num_reviews: number;
    overall_distribution: RatingItems;
    performance_distribution: RatingItems;
    story_distribution: RatingItems;
}

export interface AudibleInterface {
    product: {
        asin: string;
        authors?: AuthorInterface[];
        available_codecs: Codecs[];
        content_delivery_type: string;
        content_type: string;
        format_type: string;
        has_children: boolean;
        is_adult_product: boolean;
        is_listenable: boolean;
        is_purchasability_suppressed: boolean;
        issue_date: string;
        language: string;
        merchandising_summary: string;
        narrators?: NarratorInterface[];
        product_images: any;
        publication_name?: string;
        publisher_name: string;
        publisher_summary: string;
        rating: Ratings;
        release_date: string;
        runtime_length_min: number;
        series: SeriesInterface[];
        social_media_images: any;
        subtitle?: string;
        thesaurus_subject_keywords: [string]
        title: string;
    }
    response_groups: [string]
}

export interface SingleChapter {
    length_ms: number,
    start_offset_ms: number,
    start_offset_sec: number,
    title: string
}

export interface ChapterInterface {
    content_metadata: {
        chapter_info: {
            brandIntroDurationMs: number,
            brandOutroDurationMs: number,
            chapters: SingleChapter[],
            is_accurate: boolean,
            runtime_length_ms: number,
            runtime_length_sec: number
        }
    },
    response_groups: [string]
}
