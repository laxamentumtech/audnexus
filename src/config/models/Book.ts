import { types, schema } from 'papr'
import papr from '../papr'

const bookSchema = schema({
    asin: types.string({ required: true }),
    title: types.string({ required: true }),
    subtitle: types.string(),
    short_summary: types.string({ required: true }),
    long_summary: types.string({ required: true }),
    authors: types.array(
        types.object(
            {
                name: types.string({ required: true }),
                asin: types.string()
            }
        )
    ),
    narrators: types.array(
        types.object(
            {
                name: types.string({ required: true }),
                asin: types.string()
            }
        )
    ),
    release_date: types.date({ required: true }),
    publisher_name: types.string({ required: true }),
    language: types.string({ required: true }),
    runtime_length_min: types.number({ required: true }),
    format_type: types.string({ required: true }),
    cover_image: types.string({ required: true }),
    genres: types.array(
        types.object(
            {
                name: types.string({ required: true }),
                id: types.string({ required: true }),
                type: types.string({ required: true })
            }
        )
    ),
    primary_series: types.object(
        {
            name: types.string({ required: true }),
            id: types.string({ required: true }),
            position: types.string({ required: true })
        }
    ),
    secondary_series: types.object(
        {
            name: types.string({ required: true }),
            id: types.string({ required: true }),
            position: types.string({ required: true })
        }
    )
})

export type BookDocument = typeof bookSchema[0];
const Book = papr.model('books', bookSchema)
export default Book
