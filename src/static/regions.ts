// Regions and their TLDs

import { AudibleRegion } from '#config/typing/audible'

// https://help.audible.com/s/article/what-is-an-audible-marketplace-and-which-is-best-for-me
export const regionTLDs: AudibleRegion = {
	au: '.com.au',
	ca: 'ca',
	de: 'de',
	es: 'es',
	fr: 'fr',
	in: 'in',
	it: 'it',
	jp: 'co.jp',
	us: 'com',
	uk: 'co.uk'
}

// Regex should only match 2-letter lowercase ISO 3166-1 alpha-2 country codes
export const regionRegex = '^[a-z]{2}$'
