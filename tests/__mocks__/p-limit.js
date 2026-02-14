module.exports = function pLimit(concurrency) {
	const queue = []
	let activeCount = 0

	function processQueue() {
		while (queue.length > 0 && activeCount < concurrency) {
			const item = queue.shift()
			if (!item) break
			const { fn, resolve, reject } = item
			activeCount++
			Promise.resolve(fn())
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
