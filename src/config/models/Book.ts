import { types, schema } from 'papr'
import papr from '../papr'

const bookSchema = schema({
    asin: types.string({ required: true }),
    authors: types.array(
        types.object(
            {
                asin: types.string(),
                name: types.string({ required: true })
            }
        )
    ),
    description: types.string({ required: true }),
    formatType: types.string(),
    genres: types.array(
        types.object(
            {
                asin: types.string({ required: true }),
                name: types.string({ required: true }),
                type: types.string({ required: true })
            }
        )
    ),
    image: types.string(),
    language: types.string({ required: true }),
    narrators: types.array(
        types.object(
            {
                asin: types.string(),
                name: types.string({ required: true })
            }
        )
    ),
    publisherName: types.string({ required: true }),
    releaseDate: types.date({ required: true }),
    runtimeLengthMin: types.number(),
    seriesPrimary: types.object(
        {
            asin: types.string(),
            name: types.string({ required: true }),
            position: types.string()
        }
    ),
    seriesSecondary: types.object(
        {
            asin: types.string(),
            name: types.string({ required: true }),
            position: types.string()
        }
    ),
    subtitle: types.string(),
    summary: types.string({ required: true }),
    title: types.string({ required: true })
})

export type BookDocument = typeof bookSchema[0];
const Book = papr.model('books', bookSchema)
export default Book
