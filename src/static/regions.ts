// Regions and their TLDs

interface Region {
	strings: {
		[key: string]: string
	}
	tld: string
}

export interface Regions {
	[key: string]: Region
}

// https://help.audible.com/s/article/what-is-an-audible-marketplace-and-which-is-best-for-me
export const regions: Regions = {
	au: {
		strings: {
			chapterName: 'Chapter'
		},
		tld: 'com.au'
	},
	ca: {
		strings: {
			chapterName: 'Chapter'
		},
		tld: 'ca'
	},
	de: {
		strings: {
			chapterName: 'Kapitel'
		},
		tld: 'de'
	},
	es: {
		strings: {
			chapterName: 'Capítulo'
		},
		tld: 'es'
	},
	fr: {
		strings: {
			chapterName: 'Chapitre'
		},
		tld: 'fr'
	},
	in: {
		strings: {
			chapterName: 'Chapter'
		},
		tld: 'in'
	},
	it: {
		strings: {
			chapterName: 'Capitolo'
		},
		tld: 'it'
	},
	jp: {
		strings: {
			chapterName: '章'
		},
		tld: 'co.jp'
	},
	us: {
		strings: {
			chapterName: 'Chapter'
		},
		tld: 'com'
	},
	uk: {
		strings: {
			chapterName: 'Chapter'
		},
		tld: 'co.uk'
	}
}

// Regex should only match 2-letter lowercase ISO 3166-1 alpha-2 country codes
export const regionRegex = '^[a-z]{2}$'
