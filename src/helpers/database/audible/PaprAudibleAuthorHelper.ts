import AuthorModel from '#config/models/Author'
import { AuthorProfile } from '#config/typing/people'
import SharedHelper from '#helpers/shared'

const projectionWithoutDbFields = {
	_id: 0,
	createdAt: 0,
	updatedAt: 0
}

export default class PaprAudibleAuthorHelper {
	asin: string
	authorData!: AuthorProfile
	options: { update?: string }

	constructor(asin: string, options: { update?: string }) {
		this.asin = asin
		this.options = options
	}

	async create() {
		try {
			await AuthorModel.insertOne(this.authorData)
			return {
				data: (await this.findOneWithProjection()).data,
				modified: true
			}
		} catch (err) {
			console.error(err)
			throw new Error(`An error occurred while creating author ${this.asin} in the DB`)
		}
	}

	async delete() {
		try {
			const deletedAuthor = await AuthorModel.deleteOne({ asin: this.asin })
			return {
				data: deletedAuthor,
				modified: true
			}
		} catch (err) {
			throw new Error(err as string)
		}
	}

	async findOne() {
		const findOneAuthor = await AuthorModel.findOne({
			asin: this.asin
		})
		return {
			data: findOneAuthor,
			modified: false
		}
	}

	async findOneWithProjection() {
		const findOneAuthor = (await AuthorModel.findOne(
			{
				asin: this.asin
			},
			{ projection: projectionWithoutDbFields }
		)) as unknown as AuthorProfile
		return {
			data: findOneAuthor,
			modified: false
		}
	}

	setAuthorData(authorData: AuthorProfile) {
		this.authorData = authorData
	}

	async createOrUpdate() {
		const commonHelpers = new SharedHelper()
		const findInDb = await this.findOneWithProjection()

		// Update
		if (this.options.update === '0' && findInDb.data) {
			// If the objects are the exact same return right away
			const equality = commonHelpers.checkDataEquality(findInDb.data, this.authorData)
			if (equality) {
				return {
					data: findInDb.data,
					modified: false
				}
			}
			// Check state of existing author
			// Only update if either genres exist and can be checked
			// -or if genres exist on new item but not old
			if (findInDb.data.genres || (!findInDb.data.genres && this.authorData.genres)) {
				// Only update if it's not nuked data
				if (this.authorData.genres?.length) {
					console.log(`Updating author asin ${this.asin}`)
					// Update
					return this.update()
				}
			} else if (this.authorData.genres && this.authorData.genres.length) {
				// If no genres exist on author, but do on incoming, update
				console.log(`Updating author asin ${this.asin}`)
				// Update

				return this.update()
			}
			// No update performed, return original
			return findInDb
		}

		// Create
		return this.create()
	}

	async update() {
		try {
			await AuthorModel.updateOne({ asin: this.asin }, { $set: { ...this.authorData } })
			// After updating, return with specific projection
			return await this.findOneWithProjection()
		} catch (err) {
			console.error(err)
			throw new Error(`An error occurred while updating author ${this.asin} in the DB`)
		}
	}
}
