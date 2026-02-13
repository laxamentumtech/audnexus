// Errors for Helpers

import { regions } from '#static/regions'

// Problem with HTTP fetch
export const ErrorMessageHTTPFetch = (asin: string, error: number, source: string) =>
	`An error occured while fetching data from ${source}. Response: ${error}, ASIN: ${asin}`
// Missing environment variable
export const ErrorMessageMissingEnv = (env: string) => `Missing environment variable(s): ${env}`
// Missing Class object data
export const ErrorMessageNoData = (asin: string, source: string) =>
	`No input data from ${source} for ASIN: ${asin}`
// Not found generic
export const ErrorMessageNotFound = (asin: string, source: string) =>
	`No ${source} found for ASIN: ${asin}`
// No response to parse
export const ErrorMessageNoResponse = (asin: string, source: string) =>
	`No response from ${source} to parse for ASIN: ${asin}`
// Parse error generic
export const ErrorMessageParse = (asin: string, source: string) =>
	`An error occurred while parsing ${source}. ASIN: ${asin}`
// Item not available in region
export const ErrorMessageRegion = (asin: string, region: string) =>
	`Item not available in region '${region}' for ASIN: ${asin}`
// Content type mismatch
export const ErrorMessageContentTypeMismatch = (
	asin: string,
	actualType: string,
	expectedType: string
) => `Item is a ${actualType}, not a ${expectedType}. ASIN: ${asin}`
// Validation failed
export const ErrorMessageValidationFailed = (asin: string, reason: string) =>
	`Validation failed for ASIN: ${asin}. ${reason}`
// Release date is in the future
export const ErrorMessageReleaseDate = (asin: string) =>
	`Release date is in the future for ASIN: ${asin}`
// Required key generic message
export const ErrorMessageRequiredKey = (asin: string, key: string, source: string) =>
	`Required key '${key}' does not ${source} in Audible API response for ASIN ${asin}`
// Sorting error
export const ErrorMessageSort = (asin: string) =>
	`An error occurred while sorting book json: ${asin}`

// CRUD errors
// Create error
export const ErrorMessageCreate = (asin: string, type: string) =>
	`An error occurred while creating ${type} ${asin} in the DB`
// Delete error
export const ErrorMessageDelete = (asin: string, type: string) =>
	`An error occurred while deleting ${type} ${asin} in the DB`
// Update error
export const ErrorMessageUpdate = (asin: string, type: string) =>
	`An error occurred while updating ${type} ${asin} in the DB`
// Not found in DB
export const ErrorMessageNotFoundInDb = (asin: string, type: string) =>
	`${type} ${asin} not found in the DB for update`

// REDIS errors
// Delete error
export const ErrorMessageRedisDelete = (key: string) =>
	`An error occurred while deleting ${key} in redis`
// Set error
export const ErrorMessageRedisSet = (key: string) =>
	`An error occurred while setting ${key} in redis`

// Route errors
// Bad Query
export const ErrorMessageBadQuery = (query: string) => `Bad query: ${query}`
// Data type error
export const ErrorMessageDataType = (asin: string, type: string) =>
	`Data type for ${asin} is not ${type}`
// Missing original data
export const ErrorMessageMissingOriginal = (asin: string, type: string) =>
	`Missing original ${type} data for ASIN: ${asin}`

// Notices for Helpers
// Falling back to scraper response for chapters
export const NoticeChaptersFallback = (asin: string) =>
	`API response has no category ladders for chapters, falling back to scraper response for ASIN: ${asin}`
// Genre not available
export const NoticeGenreNotAvailable = (asin: string, index: number) =>
	`Genre ${index} not available for ASIN: ${asin}`
// Updating Asin in DB
export const NoticeUpdateAsin = (asin: string, type: string) => `Updating ${type} ASIN ${asin}`
// Running scheduled update task
export const NoticeUpdateScheduled = (type: string) => `Running scheduled update for ${type}`

// Messages for routes
export const MessageBadAsin = 'Bad ASIN'
export const MessageBadRegion = `Invalid region. Valid regions are: ${Object.keys(regions).join(
	', '
)}`
export const MessageDeleted = (asin: string) => `${asin} deleted`
export const MessageNoChapters = (asin: string) => `${asin} has no chapters`
export const MessageNoSearchParams = 'Invalid search parameters'
export const MessageNotFoundInDb = (asin: string) => `${asin} not found in the database`
