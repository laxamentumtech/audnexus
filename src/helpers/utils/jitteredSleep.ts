import { getPerformanceConfig } from '#config/performance'
import sleep from '#helpers/utils/sleep'

/**
 * Randomized pacing wait in [JITTER_MS.min, JITTER_MS.max] ms (inclusive),
 * shared by all batch workers. Env form "a-b" is a range; bare "N" means 0..N.
 */
export async function jitteredSleep(): Promise<void> {
	const { min, max } = getPerformanceConfig().JITTER_MS
	const delay = min + Math.floor(Math.random() * (max - min + 1))
	await sleep(delay)
}
