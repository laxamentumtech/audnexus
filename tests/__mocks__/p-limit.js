module.exports = function pLimit(concurrency) {
	if (
		typeof concurrency !== 'number' ||
		concurrency <= 0 ||
		!(Number.isInteger(concurrency) || concurrency === Number.POSITIVE_INFINITY)
	) {
		throw new TypeError('Expected concurrency to be a number from 1 and up')
	}

	const queue = []
	let activeCount = 0

	function processQueue() {
		while (queue.length > 0 && activeCount < concurrency) {
			const item = queue.shift()
			if (!item) break
			const { fn, resolve, reject } = item
			activeCount++
			Promise.resolve()
				.then(() => fn())
				.then(resolve)
				.catch(reject)
				.finally(() => {
					activeCount--
					processQueue()
				})
		}
	}

	return function (fn) {
		return new Promise((resolve, reject) => {
			queue.push({ fn, resolve, reject })
			processQueue()
		})
	}
}
