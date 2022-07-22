import StitchHelper from '#helpers/books/audible/StitchHelper'
import { ApiSingleChapter, Book } from '#config/typing/books'
import ChapterHelper from '#helpers/books/audible/ChapterHelper'

// Run through known book data to test responses
const asinSorcerersStone: string = 'B017V4IM1G'

describe('When stitching together Scorcerers Stone from Audible', () => {
    let response: Book
    let chapters: ApiSingleChapter[] | undefined
    beforeAll(async () => {
        // Setup helpers
        const chapterHelper = new ChapterHelper(asinSorcerersStone)
        const stitchHelper = new StitchHelper(asinSorcerersStone)
        // Run helpers
        const chapterData = await chapterHelper.process()
        const newBook = await stitchHelper.process()
        // Set variables
        chapters = chapterData?.chapters
        response = newBook
    })

    it('returned asin', () => {
        expect(response.asin).toBe(asinSorcerersStone)
    })

    it('returned 1 authors', () => {
        expect(response.authors?.length).toBe(1)
    })

    it('returned author #1', () => {
        expect(response.authors?.[0].asin).toBe('B000AP9A6K')
        expect(response.authors?.[0].name).toBe('J.K. Rowling')
    })

    it('returned description', () => {
        expect(response.description).toBe(
            'Harry Potter has never even heard of Hogwarts when the letters start dropping on the doormat at number four, Privet Drive. Addressed in green ink on yellowish parchment with a purple seal, they are swiftly confiscated by his grisly aunt and uncle....'
        )
    })

    it('returned format_type', () => {
        expect(response.formatType).toBe('unabridged')
    })

    it('returned language', () => {
        expect(response.language).toBe('english')
    })

    it('returned 1 narrators', () => {
        expect(response.narrators?.length).toBe(1)
    })

    it('returned narrator #1', () => {
        expect(response.narrators?.[0].name).toBe('Jim Dale')
    })

    it('returned cover image', () => {
        expect(response.image).toBe('https://m.media-amazon.com/images/I/91eopoUCjLL.jpg')
    })

    it('returned publisher', () => {
        expect(response.publisherName).toBe('Pottermore Publishing')
    })

    it('returned publisher_summary', () => {
        expect(response.summary).toBe(
            "<p>Turning the envelope over, his hand trembling, Harry saw a purple wax seal bearing a coat of arms; a lion, an eagle, a badger and a snake surrounding a large letter 'H'.</p> <p>Harry Potter has never even heard of Hogwarts when the letters start dropping on the doormat at number four, Privet Drive. Addressed in green ink on yellowish parchment with a purple seal, they are swiftly confiscated by his grisly aunt and uncle. Then, on Harry's eleventh birthday, a great beetle-eyed giant of a man called Rubeus Hagrid bursts in with some astonishing news: Harry Potter is a wizard, and he has a place at Hogwarts School of Witchcraft and Wizardry. An incredible adventure is about to begin!</p> <p>Having become classics of our time, the Harry Potter stories never fail to bring comfort and escapism. With their message of hope, belonging and the enduring power of truth and love, the story of the Boy Who Lived continues to delight generations of new listeners.    </p>"
        )
    })

    it('returned release_date', () => {
        expect(new Date(response.releaseDate).toISOString()).toBe(
            new Date('2015-11-20T00:00:00.000Z').toISOString()
        )
    })

    it('returned runtime length in minutes', () => {
        expect(response.runtimeLengthMin).toBe(498)
    })

    it('returned title', () => {
        expect(response.title).toBe("Harry Potter and the Sorcerer's Stone, Book 1")
    })

    it('returned 5 genres', () => {
        expect(response.genres?.length).toBe(5)
    })

    it('returned genre 1 asin', () => {
        expect(response.genres?.[0].asin).toBe('18572091011')
    })

    it('returned genre 1 name', () => {
        expect(response.genres?.[0].name).toBe("Children's Audiobooks")
    })

    it('returned genre 1 type', () => {
        expect(response.genres?.[0].type).toBe('genre')
    })

    it('returned tag 1 asin', () => {
        expect(response.genres?.[1].asin).toBe('18572091011')
    })

    it('returned tag 1 name', () => {
        expect(response.genres?.[1].name).toBe("Children's Audiobooks")
    })

    it('returned tag 1 type', () => {
        expect(response.genres?.[1].type).toBe('tag')
    })

    it('returned tag 2 asin', () => {
        expect(response.genres?.[2].asin).toBe('18572505011')
    })

    it('returned tag 2 name', () => {
        expect(response.genres?.[2].name).toBe('Family Life')
    })

    it('returned tag 2 type', () => {
        expect(response.genres?.[2].type).toBe('tag')
    })

    it('returned tag 3 asin', () => {
        expect(response.genres?.[3].asin).toBe('18572587011')
    })

    it('returned tag 3 name', () => {
        expect(response.genres?.[3].name).toBe('Fantasy & Magic')
    })

    it('returned tag 3 type', () => {
        expect(response.genres?.[3].type).toBe('tag')
    })

    it('returned tag 4 asin', () => {
        expect(response.genres?.[4].asin).toBe('18580607011')
    })

    it('returned tag 4 name', () => {
        expect(response.genres?.[4].name).toBe('Fantasy')
    })

    it('returned tag 4 type', () => {
        expect(response.genres?.[4].type).toBe('tag')
    })

    it('returned a primary series asin', () => {
        expect(response.seriesPrimary?.asin).toBe('B0182NWM9I')
    })

    it('returned a primary series name', () => {
        expect(response.seriesPrimary?.name).toBe('Harry Potter')
    })

    it('returned a primary series position', () => {
        expect(response.seriesPrimary?.position).toBe('1')
    })

    it('returned a secondary series asin', () => {
        expect(response.seriesSecondary?.asin).toBe('B07CM5ZDJL')
    })

    it('returned a secondary series name', () => {
        expect(response.seriesSecondary?.name).toBe('Wizarding World')
    })

    it('returned a secondary series position', () => {
        expect(response.seriesSecondary?.position).toBe('1')
    })

    it('returned 20 chapters', () => {
        expect(chapters?.length).toBe(20)
    })
})

// Run through known book data to test responses
const asinColdestCase: string = 'B08C6YJ1LS'

describe('When stitching together The Coldest Case from Audible', () => {
    let response: Book
    let chapters: ApiSingleChapter[] | undefined
    beforeAll(async () => {
        // Setup helpers
        const chapterHelper = new ChapterHelper(asinColdestCase)
        const stitchHelper = new StitchHelper(asinColdestCase)
        // Run helpers
        const chapterData = await chapterHelper.process()
        const newBook = await stitchHelper.process()
        // Set variables
        chapters = chapterData?.chapters
        response = newBook
    })

    it('returned asin', () => {
        expect(response.asin).toBe(asinColdestCase)
    })

    it('returned 3 authors', () => {
        expect(response.authors?.length).toBe(3)
    })

    it('returned author #1', () => {
        expect(response.authors?.[0].asin).toBe('B000APZGGS')
        expect(response.authors?.[0].name).toBe('James Patterson')
    })

    it('returned author #2', () => {
        expect(response.authors?.[1].name).toBe('Aaron Tracy')
    })

    it('returned author #3', () => {
        expect(response.authors?.[2].asin).toBe('B07R2F2DXH')
        expect(response.authors?.[2].name).toBe('Ryan Silbert')
    })

    it('returned description', () => {
        expect(response.description).toBe(
            "James Patterson's Detective Billy Harney is back, this time investigating murders in a notorious Chicago drug ring, which will lead him, his sister, and his new partner through a dangerous web of corrupt politicians, vengeful billionaires, and violent dark web conspiracies...."
        )
    })

    it('returned format_type', () => {
        expect(response.formatType).toBe('original_recording')
    })

    it('returned language', () => {
        expect(response.language).toBe('english')
    })

    it('returned 5 narrators', () => {
        expect(response.narrators?.length).toBe(5)
    })

    it('returned narrator #1', () => {
        expect(response.narrators?.[0].name).toBe('Aaron Paul')
    })

    it('returned narrator #2', () => {
        expect(response.narrators?.[1].name).toBe('Krysten Ritter')
    })

    it('returned narrator #3', () => {
        expect(response.narrators?.[2].name).toBe('Nathalie Emmanuel')
    })

    it('returned narrator #4', () => {
        expect(response.narrators?.[3].name).toBe('Beau Bridges')
    })

    it('returned narrator #5', () => {
        expect(response.narrators?.[4].name).toBe('full cast')
    })

    it('returned cover image', () => {
        expect(response.image).toBe('https://m.media-amazon.com/images/I/91H9ynKGNwL.jpg')
    })

    it('returned publisher', () => {
        expect(response.publisherName).toBe('Audible Originals')
    })

    it('returned publisher_summary', () => {
        expect(response.summary).toBe(
            "<p><b>Please note</b>: This audio drama is for mature audiences only. It contains strong language, violence, and sexual content. Discretion is advised. </p> <p><b>James Patterson's Detective Billy Harney is back, this time investigating murders in a notorious Chicago drug ring, which will lead him, his sister, and his new partner through a dangerous web of corrupt politicians, vengeful billionaires, and violent dark web conspiracies. </b></p> <p>In <i>The Coldest Case: A Black Book Audio Drama</i>, homicide detective Billy Harney sends his new partner, Kate, deep undercover in a notorious Chicago drug ring. When several members of the ring soon turn up dead, Billy abruptly pulls Kate out, blowing her cover. Kate’s informant inside the gang quickly disappears. As does the ring’s black book.... </p> <p>When Billy can’t find the informant, he wonders if Kate is secretly harboring her, since the two grew close during Kate's weeks undercover. As Billy and Kate investigate the ring’s murders, they’ll be pulled into a dangerous web of corrupt politicians, vengeful billionaires, drugged pro-athletes, and violent, dark web conspiracies, all in search of the missing black book. </p>"
        )
    })

    it('returned release_date', () => {
        expect(new Date(response.releaseDate).toISOString()).toBe(
            new Date('2021-03-11T00:00:00.000Z').toISOString()
        )
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
        expect(response.genres?.[0].asin).toBe('18574597011')
    })

    it('returned genre 1 name', () => {
        expect(response.genres?.[0].name).toBe('Mystery, Thriller & Suspense')
    })

    it('returned genre 1 type', () => {
        expect(response.genres?.[0].type).toBe('genre')
    })

    it('returned tag 1 asin', () => {
        expect(response.genres?.[1].asin).toBe('18574623011')
    })

    it('returned tag 1 name', () => {
        expect(response.genres?.[1].name).toBe('Crime Thrillers')
    })

    it('returned tag 1 type', () => {
        expect(response.genres?.[1].type).toBe('tag')
    })

    it('returned a primary series asin', () => {
        expect(response.seriesPrimary?.asin).toBe('B08RLSPY4J')
    })

    it('returned a primary series name', () => {
        expect(response.seriesPrimary?.name).toBe('A Billy Harney Thriller')
    })

    it('returned a primary series position', () => {
        expect(response.seriesPrimary?.position).toBe('0.5')
    })

    it('returned no secondary series', () => {
        expect(response.seriesSecondary).toBeUndefined()
    })

    it('returned 11 chapters', () => {
        expect(chapters?.length).toBe(11)
    })
})

const asinBad: string = 'B0036I54I6'

describe('When fetching an ASIN that has no chapters or HTML from Audible', () => {
    let response: Book
    let chapters: ApiSingleChapter[] | undefined
    beforeAll(async () => {
        // Setup helpers
        const chapterHelper = new ChapterHelper(asinBad)
        const stitchHelper = new StitchHelper(asinBad)
        // Run helpers
        const chapterData = await chapterHelper.process()
        const newBook = await stitchHelper.process()
        // Set variables
        chapters = chapterData?.chapters
        response = newBook
    })

    it('returned asin', () => {
        expect(response.asin).toBe(asinBad)
    })

    it('returned 4 authors', () => {
        expect(response.authors?.length).toBe(4)
    })

    it('returned author #1', () => {
        expect(response.authors?.[0].asin).toBeUndefined()
        expect(response.authors?.[0].name).toBe('Diane Wood Middlebrook (Professor of English')
    })

    it('returned author #2', () => {
        expect(response.authors?.[1].asin).toBeUndefined()
        expect(response.authors?.[1].name).toBe('Stanford University)')
    })

    it('returned author #3', () => {
        expect(response.authors?.[2].asin).toBeUndefined()
        expect(response.authors?.[2].name).toBe(
            'Herbert Lindenberger (Avalon Foundation Professor of Humanities'
        )
    })

    it('returned author #4', () => {
        expect(response.authors?.[3].asin).toBeUndefined()
        expect(response.authors?.[3].name).toBe('Comparative Literature')
    })

    it('returned description', () => {
        expect(response.description).toBe(
            'Both Anne Sexton and Sylvia Plath rose above severe mental disorders to create bold new directions...'
        )
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
        expect(response.image).toBe('https://m.media-amazon.com/images/I/41dNQts9Z7L.jpg')
    })

    it('returned publisher', () => {
        expect(response.publisherName).toBe('Stanford Audio')
    })

    it('returned publisher_summary', () => {
        expect(response.summary).toBe(
            'Both Anne Sexton and Sylvia Plath rose above severe mental disorders to create bold new directions for American poetry and share the woman\'s perspective in distinct, powerful voices. Professor Middlebrook, author of the best selling <i>Anne Sexton: A Biography</i>, sheds light on the unique and important contributions of these poets by examining 4 works: "Morning Song" and "Ariel" by Plath and "The Fortress" and "The Double Image" by Sexton. Her conversations with Professor Lindenberger and an audience further delve into the work and lives of these women, their friendship, and their tragic deaths.'
        )
    })

    it('returned release_date', () => {
        expect(new Date(response.releaseDate).toISOString()).toBe(
            new Date('1999-12-16T00:00:00.000Z').toISOString()
        )
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
        expect(chapters).toBeUndefined()
    })
})
