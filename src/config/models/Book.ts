import { types, schema } from 'papr'
import papr from '../papr'

const bookSchema = schema({
    asin: types.string({ required: true }),
    title: types.string({ required: true }),
    subtitle: types.string(),
    description: types.string({ required: true }),
    summary: types.string({ required: true }),
    authors: types.array(
        types.object(
            {
                asin: types.string(),
                name: types.string({ required: true })
            }
        )
    ),
    narrators: types.array(
        types.object(
            {
                asin: types.string(),
                name: types.string({ required: true })
            }
        )
    ),
    releaseDate: types.date({ required: true }),
    publisherName: types.string({ required: true }),
    language: types.string({ required: true }),
    runtimeLengthMin: types.number({ required: true }),
    formatType: types.string({ required: true }),
    image: types.string({ required: true }),
    genres: types.array(
        types.object(
            {
                asin: types.string({ required: true }),
                name: types.string({ required: true }),
                type: types.string({ required: true })
            }
        )
    ),
    primarySeries: types.object(
        {
            asin: types.string({ required: true }),
            name: types.string({ required: true }),
            position: types.string({ required: true })
        }
    ),
    secondarySeries: types.object(
        {
            asin: types.string({ required: true }),
            name: types.string({ required: true }),
            position: types.string({ required: true })
        }
    )
})

export type BookDocument = typeof bookSchema[0];
const Book = papr.model('books', bookSchema)
export default Book
