class Papr {
	initialize() {}
	updateSchemas() {}
	model() {
		return {
			insertOne: jest.fn(),
			findOne: jest.fn(),
			find: jest.fn(),
			deleteOne: jest.fn(),
			updateOne: jest.fn()
		}
	}
}
const types = {
	array: () => ({}),
	boolean: () => ({}),
	date: () => ({}),
	map: () => ({}),
	number: () => ({}),
	object: () => ({}),
	objectId: () => ({}),
	string: () => ({})
}
const schema = () => ({})

module.exports = Papr
module.exports.types = types
module.exports.schema = schema
