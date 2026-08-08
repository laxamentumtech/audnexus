import type { AudibleProduct } from '#config/types'

type LiteratureType = 'fiction' | 'nonfiction'

interface RegionTable {
	fictionRoots: readonly string[]
	mixedChildren: Readonly<Record<string, readonly string[]>>
}

const LITERATURE_TABLES: Record<string, RegionTable> = {
	us: {
		fictionRoots: [
			'Erotica',
			'Literature & Fiction',
			'Mystery, Thriller & Suspense',
			'Romance',
			'Science Fiction & Fantasy'
		],
		mixedChildren: {
			"Children's Audiobooks": [
				'Action & Adventure',
				'Fairy Tales, Folk Tales & Myths',
				'Humor',
				'Literature & Fiction',
				'Mystery & Suspense',
				'Science Fiction & Fantasy'
			],
			'Comedy & Humor': ['Literature & Fiction'],
			'LGBTQ+': [
				'Literature & Fiction',
				'Mystery, Thriller & Suspense',
				'Romance',
				'Science Fiction & Fantasy'
			],
			'Teen & Young Adult': [
				'Literature & Fiction',
				'Mystery, Thriller & Suspense',
				'Romance',
				'Science Fiction & Fantasy'
			]
		}
	},
	uk: {
		fictionRoots: [
			'Erotica',
			'Literature & Fiction',
			'Mystery, Thriller & Suspense',
			'Romance',
			'Science Fiction & Fantasy'
		],
		mixedChildren: {
			"Children's Audiobooks": [
				'Action & Adventure',
				'Fairy Tales, Folk Tales & Myths',
				'Humor',
				'Literature & Fiction',
				'Mystery & Suspense',
				'Science Fiction & Fantasy'
			],
			'Comedy & Humour': ['Literature & Fiction'],
			'LGBTQ+': [
				'Literature & Fiction',
				'Mystery, Thriller & Suspense',
				'Romance',
				'Science Fiction & Fantasy'
			],
			'Teen & Young Adult': [
				'Literature & Fiction',
				'Mystery, Thriller & Suspense',
				'Romance',
				'Science Fiction & Fantasy'
			]
		}
	},
	ca: {
		fictionRoots: [
			'Erotica',
			'Literature & Fiction',
			'Mystery, Thriller & Suspense',
			'Romance',
			'Science Fiction & Fantasy'
		],
		mixedChildren: {
			"Children's Audiobooks": [
				'Action & Adventure',
				'Fairy Tales, Folk Tales & Myths',
				'Humour',
				'Literature & Fiction',
				'Mystery & Suspense',
				'Science Fiction & Fantasy'
			],
			'Comedy & Humor': ['Literature & Fiction'],
			'LGBTQ2S+': ['Literature & Fiction', 'Romance', 'Science Fiction & Fantasy'],
			'Teen & Young Adult': [
				'Literature & Fiction',
				'Mystery, Thriller & Suspense',
				'Romance',
				'Science Fiction & Fantasy'
			]
		}
	},
	au: {
		fictionRoots: [
			'Erotica',
			'Literature & Fiction',
			'Mystery, Thriller & Suspense',
			'Romance',
			'Science Fiction & Fantasy'
		],
		mixedChildren: {
			"Children's Audiobooks": [
				'Action & Adventure',
				'Fairy Tales, Folk Tales & Myths',
				'Humour',
				'Literature & Fiction',
				'Mystery & Suspense',
				'Science Fiction & Fantasy'
			],
			'Comedy & Humour': ['Literature & Fiction'],
			'LGBTQ+': [
				'Literature & Fiction',
				'Mystery, Thriller & Suspense',
				'Romance',
				'Science Fiction & Fantasy'
			],
			'Teen & Young Adult': [
				'Literature & Fiction',
				'Mystery, Thriller & Suspense',
				'Romance',
				'Science Fiction & Fantasy'
			]
		}
	},
	in: {
		fictionRoots: [
			'Literature & Fiction',
			'Mature Content',
			'Mystery, Thriller & Suspense',
			'Romance',
			'Science Fiction & Fantasy'
		],
		mixedChildren: {
			"Children's Audiobooks": [
				'Action & Adventure',
				'Fairy Tales, Folk Tales & Myths',
				'Humour',
				'Literature & Fiction',
				'Mystery & Suspense',
				'Science Fiction & Fantasy'
			],
			'Comedy & Humor': ['Literature & Fiction'],
			'LGBTQ+': [
				'Literature & Fiction',
				'Mystery, Thriller & Suspense',
				'Romance',
				'Science Fiction & Fantasy'
			],
			'Teen & Young Adult': [
				'Literature & Fiction',
				'Mystery, Thriller & Suspense',
				'Romance',
				'Science Fiction & Fantasy'
			]
		}
	},
	de: {
		fictionRoots: [
			'Erotik',
			'Krimis & Thriller',
			'Liebesromane',
			'Literatur & Belletristik',
			'Science Fiction & Fantasy'
		],
		mixedChildren: {
			'Comedy & Humor': ['Literatur & Belletristik'],
			'Jugendliche & Heranwachsende': [
				'Krimis & Thriller',
				'Liebesromane',
				'Literatur & Belletristik',
				'Science Fiction & Fantasy'
			],
			'Kinder-Hörbücher': [
				'Action & Abenteuer',
				'Detektive & Spannung',
				'Literatur & Belletristik',
				'Märchen & Mythen',
				'Science Fiction & Fantasy'
			],
			LGBT: [
				'Krimis & Thriller',
				'Romanze',
				'Literatur & Belletristik',
				'Science Fiction & Fantasy'
			]
		}
	},
	es: {
		fictionRoots: [
			'Ciencia ficción y fantasía',
			'Erótica',
			'Literatura y ficción',
			'Policíaca, negra y suspense',
			'Romántica'
		],
		mixedChildren: {
			Adolescentes: [
				'Ciencia ficción y fantasía',
				'Literatura y ficción',
				'Policíaca, negra y suspense',
				'Romántica'
			],
			'Audiolibros infantiles': [
				'Acción y aventura',
				'Ciencia ficción y fantasía',
				'Cuentos y leyendas',
				'Humor',
				'Literatura y ficción',
				'Misterio y suspense'
			],
			'Comedia y humor': ['Literatura y ficción'],
			'LGBTQ+': [
				'Ciencia ficción y fantasía',
				'Literatura y ficción',
				'Misterio, negra y suspense',
				'Romántica'
			]
		}
	},
	fr: {
		fictionRoots: [
			'Littérature, romans et fiction',
			'Policier, thrillers et œuvres à suspense',
			'Romance',
			'Science-Fiction et fantasy',
			'Érotisme'
		],
		mixedChildren: {
			'Adolescents et jeunes adultes': [
				'Policier, thrillers et œuvres à suspense',
				"Roman d'amour",
				'Roman et littérature',
				'Science-fiction et fantasy'
			],
			'Comédie et humour': ['Littérature et fiction'],
			Jeunesse: [
				'Action et aventure',
				'Contes de fées et populaires et mythes',
				'Humour',
				'Policier et suspense',
				'Roman et littérature',
				'Science-fiction et fantasy'
			],
			LGBT: [
				'Policier, thrillers et œuvres à suspense',
				'Romance',
				'Littérature et fiction',
				'Science-fiction et fantasy'
			]
		}
	},
	it: {
		fictionRoots: [
			'Erotismo',
			'Fantascienza e fantasy',
			'Letteratura e narrativa',
			'Poliziesco, thriller e suspense',
			"Romanzo d'amore"
		],
		mixedChildren: {
			'Adolescenti e Ragazzi': [
				'Fantascienza e fantasy',
				'Letteratura e narrativa',
				'Poliziesco, thriller e suspense',
				"Romanzo d'amore"
			],
			'Audiolibri per bambini': [
				'Azione e avventura',
				'Fantascienza e fantasy',
				'Fiabe, racconti popolari e miti',
				'Humor',
				'Letteratura e narrativa',
				'Poliziesco e suspense'
			],
			'Commedia e umorismo': ['Letteratura e fiction'],
			LGBT: ['Letteratura e narrativa', "Romanzo d'amore"]
		}
	},
	jp: {
		fictionRoots: [
			'SF・ファンタジー',
			'アダルト',
			'ティーンズラブ',
			'ボーイズラブ',
			'ミステリー・スリラー・サスペンス',
			'ライトノベル(ラノベ)',
			'官能・ロマンス',
			'文学・フィクション'
		],
		mixedChildren: {
			LGBT: [
				'文学・フィクション',
				'ロマンス',
				'ミステリー・スリラー・サスペンス',
				'SF・ファンタジー'
			],
			'コメディー・落語': ['ユーモア・風刺文学・フィクション'],
			ティーン: [
				'SF・ファンタジー',
				'文学・フィクション・ライトノベル',
				'ミステリー・スリラー・サスペンス',
				'ロマンス'
			],
			'絵本・児童書': [
				'SF・ファンタジー',
				'アクション・アドベンチャー',
				'ミステリー・サスペンス',
				'ユーモア',
				'文学・フィクション',
				'童話・民話・神話'
			]
		}
	}
}

export default function literatureTypeFromProduct(
	categoryLadders: AudibleProduct['product']['category_ladders'],
	thesaurusKeywords: string[] | undefined,
	region: string
): LiteratureType {
	const table = LITERATURE_TABLES[region] ?? LITERATURE_TABLES['us']
	if (categoryLadders.length > 0) {
		const matches = categoryLadders.some(({ ladder }) => {
			const root = ladder[0]?.name
			if (!root) return false
			if (table.fictionRoots.includes(root)) return true
			const children = table.mixedChildren[root]
			return !!children && children.includes(ladder[1]?.name ?? '')
		})
		if (matches) return 'fiction'
		return 'nonfiction'
	}
	return thesaurusKeywords?.some(
		(keyword) => /(^|[^a-z])fiction([^a-z]|$)/i.test(keyword) && !/non[- ]?fiction/i.test(keyword)
	)
		? 'fiction'
		: 'nonfiction'
}
