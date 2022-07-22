import { AuthorDocument } from '#config/models/Author'
import { BookDocument } from '#config/models/Book'
import { ChapterDocument } from '#config/models/Chapter'

/**
 * Migrates data without timestamps, using the objectID as the creation date
 * @param data Document to add timestamps to
 * @returns Document with timestamps added
 */
export default function addTimestamps(
	data: AuthorDocument | BookDocument | ChapterDocument
): AuthorDocument | BookDocument | ChapterDocument {
	if (!data.createdAt) {
		// Get the objectID timestamp as creation date
		data.createdAt = data._id.getTimestamp()
		// We are updating the document, so set the updatedAt timestamp
		data.updatedAt = new Date()
	}
	return data
}
