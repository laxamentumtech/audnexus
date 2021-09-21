import ApiHelper from '../../src/helpers/audibleApi'
import ScrapeHelper from '../../src/helpers/audibleScrape'
import StitchHelper from '../../src/helpers/audibleStitch'
import { BookInterface } from '../../src/interfaces/books'
import ChapterHelper from '../../src/helpers/audibleChapter'

// Run through known book data to test responses
const asinSorcerersStone: string = 'B017V4IM1G'

describe('When stitching together Scorcerers Stone from Audible', () => {
    let response: BookInterface
    beforeAll(async () => {
        const api = new ApiHelper(asinSorcerersStone)
        const chap = new ChapterHelper(asinSorcerersStone)
        const scraper = new ScrapeHelper(asinSorcerersStone)

        // Run fetch tasks in parallel/resolve promises
        const [apiRes, scraperRes, chapRes] = await Promise.all([api.fetchBook(), scraper.fetchBook(), chap.fetchBook()])

        // Run parse tasks in parallel/resolve promises
        const [parseApi, parseScraper, parseChap] = await Promise.all([api.parseResponse(apiRes), scraper.parseResponse(scraperRes), chap.parseResponse(chapRes)])

        const stitch = new StitchHelper(parseApi)
        if (parseScraper !== undefined) {
            stitch.htmlRes = parseScraper
        }
        if (parseChap !== undefined) {
            stitch.tempJson.chapterInfo = parseChap
        }

        response = await Promise.resolve(stitch.process())
    })

    it('returned asin', () => {
        expect(response.asin).toBe(asinSorcerersStone)
    })

    it('returned 1 authors', () => {
        expect(response.authors!.length).toBe(1)
    })

    it('returned author #1', () => {
        expect(response.authors![0].asin).toBe('B000AP9A6K')
        expect(response.authors![0].name).toBe('J.K. Rowling')
    })

    it('returned description', () => {
        expect(response.description).toBe('Harry Potter is a wizard - and not only a wizard, he’s an incredibly famous wizard. Rubeus Hagrid spirits him away from his less-than-fortunate life to Hogwarts School of Witchcraft and Wizardry, setting into motion an incredible adventure....')
    })

    it('returned format_type', () => {
        expect(response.formatType).toBe('unabridged')
    })

    it('returned language', () => {
        expect(response.language).toBe('english')
    })

    it('returned 1 narrators', () => {
        expect(response.narrators!.length).toBe(1)
    })

    it('returned narrator #1', () => {
        expect(response.narrators![0].name).toBe('Jim Dale')
    })

    it('returned cover image', () => {
        expect(response.image).toBe('https://m.media-amazon.com/images/I/51U4p-ir2BL.jpg')
    })

    it('returned publisher', () => {
        expect(response.publisherName).toBe('Pottermore Publishing')
    })

    it('returned publisher_summary', () => {
        expect(response.summary).toBe('<p>A global phenomenon and cornerstone of contemporary children’s literature, J.K. Rowling’s <i>Harry Potter</i> series is both universally adored and critically acclaimed. Now, experience the magic as you’ve never heard it before. The inimitable Jim Dale brings to life an entire cast of characters - from the pinched, nasal whine of Petunia Dursley to the shrill huff of the Sorting Hat to the earnest, wondrous voice of the boy wizard himself. </p> <p>Orphaned as an infant, young Harry Potter has been living a less-than-fortunate life. Belittled by his pompous uncle and sniveling aunt (not to mention his absolute terror of a cousin, Dudley), Harry has resigned himself to a mediocre existence in the cupboard under the stairs. But then the letters start dropping on the doormat at Number Four, Privet Drive. Addressed to “Mr. H. Potter” and stamped shut with a purple wax seal, the peculiar envelopes are swiftly confiscated by his relentlessly cruel family. But nothing stops Rubeus Hagrid, a great beetle-eyed giant of a man, from kicking down the door and bursting in with astonishing news: Harry Potter is a wizard - and not only a wizard, he’s an incredibly famous wizard. Hagrid spirits him away to Hogwarts School of Witchcraft and Wizardry, setting into motion an incredible adventure (Banks run by goblins! Enchanted train platforms! Invisibility Cloaks!) that listeners won’t ever forget.</p> <p>Having now become classics of our time, the Harry Potter audiobooks never fail to bring comfort and escapism to listeners of all ages. With its message of hope, belonging, and the enduring power of truth and love, the story of the Boy Who Lived continues to delight generations of new listeners. </p>')
    })

    it('returned release_date', () => {
        expect(new Date(response.releaseDate).toISOString()).toBe(new Date('2015-11-20T00:00:00.000Z').toISOString())
    })

    it('returned runtime length in minutes', () => {
        expect(response.runtimeLengthMin).toBe(498)
    })

    it('returned title', () => {
        expect(response.title).toBe('Harry Potter and the Sorcerer\'s Stone, Book 1')
    })

    it('returned 2 genres', () => {
        expect(response.genres?.length).toBe(2)
    })

    it('returned genre 1 asin', () => {
        expect(response.genres![0].asin).toBe('18572091011')
    })

    it('returned genre 1 name', () => {
        expect(response.genres![0].name).toBe('Children\'s Audiobooks')
    })

    it('returned genre 1 type', () => {
        expect(response.genres![0].type).toBe('parent')
    })

    it('returned genre 2 asin', () => {
        expect(response.genres![1].asin).toBe('18572491011')
    })

    it('returned genre 2 name', () => {
        expect(response.genres![1].name).toBe('Literature & Fiction')
    })

    it('returned genre 2 type', () => {
        expect(response.genres![1].type).toBe('child')
    })

    it('returned a primary series asin', () => {
        expect(response.seriesPrimary!.asin).toBe('B0182NWM9I')
    })

    it('returned a primary series name', () => {
        expect(response.seriesPrimary!.name).toBe('Harry Potter')
    })

    it('returned a primary series position', () => {
        expect(response.seriesPrimary!.position).toBe('Book 1')
    })

    it('returned a secondary series asin', () => {
        expect(response.seriesSecondary!.asin).toBe('B07CM5ZDJL')
    })

    it('returned a secondary series name', () => {
        expect(response.seriesSecondary!.name).toBe('Wizarding World')
    })

    it('returned a secondary series position', () => {
        expect(response.seriesSecondary!.position).toBe('Book 1')
    })
})

// Run through known book data to test responses
const asinColdestCase: string = 'B08C6YJ1LS'

describe('When stitching together The Coldest Case from Audible', () => {
    let response: BookInterface
    beforeAll(async () => {
        const api = new ApiHelper(asinColdestCase)
        const chap = new ChapterHelper(asinColdestCase)
        const scraper = new ScrapeHelper(asinColdestCase)

        // Run fetch tasks in parallel/resolve promises
        const [apiRes, scraperRes, chapRes] = await Promise.all([api.fetchBook(), scraper.fetchBook(), chap.fetchBook()])

        // Run parse tasks in parallel/resolve promises
        const [parseApi, parseScraper, parseChap] = await Promise.all([api.parseResponse(apiRes), scraper.parseResponse(scraperRes), chap.parseResponse(chapRes)])

        const stitch = new StitchHelper(parseApi)
        if (parseScraper !== undefined) {
            stitch.htmlRes = parseScraper
        }
        if (parseChap !== undefined) {
            stitch.tempJson.chapterInfo = parseChap
        }

        response = await Promise.resolve(stitch.process())
    })

    it('returned asin', () => {
        expect(response.asin).toBe(asinColdestCase)
    })

    it('returned 3 authors', () => {
        expect(response.authors!.length).toBe(3)
    })

    it('returned author #1', () => {
        expect(response.authors![0].asin).toBe('B000APZGGS')
        expect(response.authors![0].name).toBe('James Patterson')
    })

    it('returned author #2', () => {
        expect(response.authors![1].name).toBe('Aaron Tracy')
    })

    it('returned author #3', () => {
        expect(response.authors![2].asin).toBe('B07R2F2DXH')
        expect(response.authors![2].name).toBe('Ryan Silbert')
    })

    it('returned description', () => {
        expect(response.description).toBe('James Patterson\'s Detective Billy Harney is back, this time investigating murders in a notorious Chicago drug ring, which will lead him, his sister, and his new partner through a dangerous web of corrupt politicians, vengeful billionaires, and violent dark web conspiracies....   ')
    })

    it('returned format_type', () => {
        expect(response.formatType).toBe('original_recording')
    })

    it('returned language', () => {
        expect(response.language).toBe('english')
    })

    it('returned 5 narrators', () => {
        expect(response.narrators!.length).toBe(5)
    })

    it('returned narrator #1', () => {
        expect(response.narrators![0].name).toBe('Aaron Paul')
    })

    it('returned narrator #2', () => {
        expect(response.narrators![1].name).toBe('Krysten Ritter')
    })

    it('returned narrator #3', () => {
        expect(response.narrators![2].name).toBe('Nathalie Emmanuel')
    })

    it('returned narrator #4', () => {
        expect(response.narrators![3].name).toBe('Beau Bridges')
    })

    it('returned narrator #5', () => {
        expect(response.narrators![4].name).toBe('full cast')
    })

    it('returned cover image', () => {
        expect(response.image).toBe('https://m.media-amazon.com/images/I/51SteOEMD8L.jpg')
    })

    it('returned publisher', () => {
        expect(response.publisherName).toBe('Audible Originals')
    })

    it('returned publisher_summary', () => {
        expect(response.summary).toBe('<p><b>Please note</b>: This audio drama is for mature audiences only. It contains strong language, violence, and sexual content. Discretion is advised. </p> <p><b>James Patterson\'s Detective Billy Harney is back, this time investigating murders in a notorious Chicago drug ring, which will lead him, his sister, and his new partner through a dangerous web of corrupt politicians, vengeful billionaires, and violent dark web conspiracies. </b></p> <p>In <i>The Coldest Case: A Black Book Audio Drama</i>, homicide detective Billy Harney sends his new partner, Kate, deep undercover in a notorious Chicago drug ring. When several members of the ring soon turn up dead, Billy abruptly pulls Kate out, blowing her cover. Kate’s informant inside the gang quickly disappears. As does the ring’s black book.... </p> <p>When Billy can’t find the informant, he wonders if Kate is secretly harboring her, since the two grew close during Kate\'s weeks undercover. As Billy and Kate investigate the ring’s murders, they’ll be pulled into a dangerous web of corrupt politicians, vengeful billionaires, drugged pro-athletes, and violent, dark web conspiracies, all in search of the missing black book. </p>')
    })

    it('returned release_date', () => {
        expect(new Date(response.releaseDate).toISOString()).toBe(new Date('2021-03-11T00:00:00.000Z').toISOString())
    })

    it('returned runtime length in minutes', () => {
        expect(response.runtimeLengthMin).toBe(232)
    })

    it('returned title', () => {
        expect(response.title).toBe('The Coldest Case: A Black Book Audio Drama')
    })

    it('returned 2 genres', () => {
        expect(response.genres?.length).toBe(2)
    })

    it('returned genre 1 asin', () => {
        expect(response.genres![0].asin).toBe('18574597011')
    })

    it('returned genre 1 name', () => {
        expect(response.genres![0].name).toBe('Mystery, Thriller & Suspense')
    })

    it('returned genre 1 type', () => {
        expect(response.genres![0].type).toBe('parent')
    })

    it('returned genre 2 asin', () => {
        expect(response.genres![1].asin).toBe('18574621011')
    })

    it('returned genre 2 name', () => {
        expect(response.genres![1].name).toBe('Thriller & Suspense')
    })

    it('returned genre 2 type', () => {
        expect(response.genres![1].type).toBe('child')
    })

    it('returned a primary series asin', () => {
        expect(response.seriesPrimary!.asin).toBe('B08RLSPY4J')
    })

    it('returned a primary series name', () => {
        expect(response.seriesPrimary!.name).toBe('A Billy Harney Thriller')
    })

    it('returned a primary series position', () => {
        expect(response.seriesPrimary!.position).toBe('Book 0.5')
    })

    it('returned a secondary series asin', () => {
        expect(response.seriesSecondary!).toBeUndefined()
    })
})

const asinBad: string = 'B0036I54I6'

describe('When fetching an ASIN that has no chapters or HTML from Audible', () => {
    let response: BookInterface
    beforeAll(async () => {
        const api = new ApiHelper(asinBad)
        const chap = new ChapterHelper(asinBad)
        const scraper = new ScrapeHelper(asinBad)

        // Run fetch tasks in parallel/resolve promises
        const [apiRes, scraperRes, chapRes] = await Promise.all([api.fetchBook(), scraper.fetchBook(), chap.fetchBook()])

        // Run parse tasks in parallel/resolve promises
        const [parseApi, parseScraper, parseChap] = await Promise.all([api.parseResponse(apiRes), scraper.parseResponse(scraperRes), chap.parseResponse(chapRes)])

        const stitch = new StitchHelper(parseApi)
        if (parseScraper !== undefined) {
            stitch.htmlRes = parseScraper
        }
        if (parseChap !== undefined) {
            stitch.tempJson.chapterInfo = parseChap
        }

        response = await Promise.resolve(stitch.process())
    })

    it('returned asin', () => {
        expect(response.asin).toBe(asinBad)
    })

    it('returned 4 authors', () => {
        expect(response.authors!.length).toBe(4)
    })

    it('returned author #1', () => {
        expect(response.authors![0].asin).toBeUndefined()
        expect(response.authors![0].name).toBe('Diane Wood Middlebrook (Professor of English')
    })

    it('returned author #2', () => {
        expect(response.authors![1].asin).toBeUndefined()
        expect(response.authors![1].name).toBe('Stanford University)')
    })

    it('returned author #3', () => {
        expect(response.authors![2].asin).toBeUndefined()
        expect(response.authors![2].name).toBe('Herbert Lindenberger (Avalon Foundation Professor of Humanities')
    })

    it('returned author #4', () => {
        expect(response.authors![3].asin).toBeUndefined()
        expect(response.authors![3].name).toBe('Comparative Literature')
    })

    it('returned description', () => {
        expect(response.description).toBe('Both Anne Sexton and Sylvia Plath rose above severe mental disorders to create bold new directions...')
    })

    it('returned format_type', () => {
        expect(response.formatType).toBe('unabridged')
    })

    it('returned language', () => {
        expect(response.language).toBe('english')
    })

    it('returned no narrators', () => {
        expect(response.narrators).toBeUndefined()
    })

    it('returned cover image', () => {
        expect(response.image).toBe('https://m.media-amazon.com/images/I/51gXD-lb7vL.jpg')
    })

    it('returned publisher', () => {
        expect(response.publisherName).toBe('Stanford Audio')
    })

    it('returned publisher_summary', () => {
        expect(response.summary).toBe('Both Anne Sexton and Sylvia Plath rose above severe mental disorders to create bold new directions for American poetry and share the woman\'s perspective in distinct, powerful voices. Professor Middlebrook, author of the best selling <i>Anne Sexton: A Biography</i>, sheds light on the unique and important contributions of these poets by examining 4 works: "Morning Song" and "Ariel" by Plath and "The Fortress" and "The Double Image" by Sexton. Her conversations with Professor Lindenberger and an audience further delve into the work and lives of these women, their friendship, and their tragic deaths.')
    })

    it('returned release_date', () => {
        expect(new Date(response.releaseDate).toISOString()).toBe(new Date('1999-12-16T00:00:00.000Z').toISOString())
    })

    it('returned runtime length in minutes', () => {
        expect(response.runtimeLengthMin).toBe(114)
    })

    it('returned title', () => {
        expect(response.title).toBe('The Poetry of Anne Sexton and Sylvia Plath')
    })

    it('returned no genres', () => {
        expect(response.genres).toBeUndefined()
    })

    it('returned no seriesPrimary', () => {
        expect(response.seriesPrimary).toBeUndefined()
    })

    it('returned no chaptersSecondary', () => {
        expect(response.seriesSecondary).toBeUndefined()
    })

    it('returned no chapters', () => {
        expect(response.chapterInfo).toBeUndefined()
    })
})
