import { MongoClient } from 'mongodb'
import Papr from 'papr'

export let client: MongoClient

const papr = new Papr()
if (!process.env.MONGODB_URI) {
    throw new Error('No MongoDB URI specified')
}
const uri = process.env.MONGODB_URI

export async function connect () {
    client = await MongoClient.connect(uri)

    papr.initialize(client.db('audnexus'))

    await papr.updateSchemas()
}

export async function disconnect () {
    await client.close()
}

export default papr
