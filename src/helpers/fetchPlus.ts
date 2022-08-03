import 'isomorphic-fetch'

function fetchPlus(url: string, options = {}, retries = 0): Promise<Response> {
	return new Promise((resolve, reject) => {
		fetch(url, options)
			.then((res) => {
				if (res.status === 200) {
					resolve(res)
				} else {
					reject(res)
				}
			})
			.catch((err) => {
				if (retries < 3) {
					fetchPlus(url, options, retries + 1)
						.then(resolve)
						.catch(reject)
				} else {
					reject(err)
				}
			})
	})
}

export default fetchPlus
