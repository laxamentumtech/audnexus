import { getPerformanceConfig } from '#config/performance'

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerOptions {
	failureThreshold?: number
	resetTimeoutMs?: number
	successThreshold?: number
}

export interface CircuitBreakerStats {
	state: CircuitState
	failures: number
	successes: number
	lastFailureTime: number | null
	lastSuccessTime: number | null
}

export const DEFAULT_CIRCUIT_BREAKER_OPTIONS: Required<CircuitBreakerOptions> = {
	failureThreshold: 5,
	resetTimeoutMs: 60000,
	successThreshold: 2
}

/**
 * Maximum success count to prevent unbounded growth in CLOSED state.
 * This cap prevents integer overflow issues while maintaining sufficient
 * precision for tracking success patterns.
 */
export const MAX_SUCCESS_COUNT = 10000

/**
 * Circuit Breaker pattern implementation for external API calls
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failure threshold exceeded, requests fail fast
 * - HALF_OPEN: Testing if service has recovered
 *
 * Transitions:
 * - CLOSED -> OPEN: failures >= failureThreshold
 * - OPEN -> HALF_OPEN: resetTimeoutMs elapsed
 * - HALF_OPEN -> CLOSED: successes >= successThreshold
 * - HALF_OPEN -> OPEN: any failure
 */
export class CircuitBreaker {
	private state: CircuitState = 'CLOSED'
	private failures = 0
	private successes = 0
	private lastFailureTime: number | null = null
	private lastSuccessTime: number | null = null
	private nextAttempt: number = Date.now()

	private readonly failureThreshold: number
	private readonly resetTimeoutMs: number
	private readonly successThreshold: number

	private static normalizeOption(value: number | undefined, defaultValue: number): number {
		if (value === undefined) {
			return defaultValue
		}

		if (!Number.isFinite(value)) {
			return defaultValue
		}

		const intValue = Math.floor(value)
		return intValue >= 1 ? intValue : defaultValue
	}

	constructor(options: CircuitBreakerOptions = {}) {
		const config = getPerformanceConfig()

		// If circuit breaker is disabled via feature flag, set thresholds to never trip
		const enabled = config.CIRCUIT_BREAKER_ENABLED

		const normalizedFailureThreshold = CircuitBreaker.normalizeOption(
			options.failureThreshold,
			DEFAULT_CIRCUIT_BREAKER_OPTIONS.failureThreshold
		)
		const normalizedResetTimeoutMs = CircuitBreaker.normalizeOption(
			options.resetTimeoutMs,
			DEFAULT_CIRCUIT_BREAKER_OPTIONS.resetTimeoutMs
		)
		const normalizedSuccessThreshold = CircuitBreaker.normalizeOption(
			options.successThreshold,
			DEFAULT_CIRCUIT_BREAKER_OPTIONS.successThreshold
		)
		this.failureThreshold = enabled ? normalizedFailureThreshold : Number.MAX_SAFE_INTEGER
		this.resetTimeoutMs = normalizedResetTimeoutMs
		this.successThreshold = normalizedSuccessThreshold
	}

	/**
	 * Get current circuit breaker statistics
	 */
	getStats(): CircuitBreakerStats {
		return {
			state: this.state,
			failures: this.failures,
			successes: this.successes,
			lastFailureTime: this.lastFailureTime,
			lastSuccessTime: this.lastSuccessTime
		}
	}

	/**
	 * Check if circuit allows requests
	 */
	canExecute(): boolean {
		this.transitionState()
		return this.state !== 'OPEN'
	}

	/**
	 * Execute a function with circuit breaker protection
	 * @param fn Function to execute
	 * @returns Result of the function
	 * @throws Error if circuit is OPEN or function fails
	 */
	async execute<T>(fn: () => Promise<T>): Promise<T> {
		this.transitionState()

		if (this.state === 'OPEN') {
			const timeUntilRetry = Math.max(1, Math.ceil((this.nextAttempt - Date.now()) / 1000))
			throw new Error(`Circuit breaker is OPEN. Retry in ${timeUntilRetry}s`)
		}

		const isHalfOpen = this.state === 'HALF_OPEN'

		try {
			const result = await fn()
			this.onSuccess(isHalfOpen)
			return result
		} catch (error) {
			this.onFailure(isHalfOpen)
			throw error
		}
	}

	/**
	 * Transition circuit state based on time
	 */
	private transitionState(): void {
		const now = Date.now()

		if (this.state === 'OPEN' && now >= this.nextAttempt) {
			this.state = 'HALF_OPEN'
			this.failures = 0
			this.successes = 0
		}
	}

	/**
	 * Handle successful execution
	 */
	private onSuccess(isHalfOpen: boolean): void {
		this.lastSuccessTime = Date.now()

		if (isHalfOpen) {
			this.successes++
			if (this.successes >= this.successThreshold) {
				// Service recovered, close the circuit
				this.state = 'CLOSED'
				this.failures = 0
				this.successes = 0
			}
		} else {
			// In CLOSED state, just track success with a cap to prevent unbounded growth
			this.successes = Math.min(this.successes + 1, MAX_SUCCESS_COUNT)
		}
	}

	/**
	 * Handle failed execution
	 */
	private onFailure(isHalfOpen: boolean): void {
		this.lastFailureTime = Date.now()
		this.failures++

		if (isHalfOpen) {
			// Any failure in HALF_OPEN goes back to OPEN
			this.openCircuit()
		} else if (this.failures >= this.failureThreshold) {
			// Failure threshold exceeded in CLOSED state
			this.openCircuit()
		}
	}

	/**
	 * Open the circuit
	 */
	private openCircuit(): void {
		this.state = 'OPEN'
		this.nextAttempt = Date.now() + this.resetTimeoutMs
		this.failures = 0
		this.successes = 0
	}

	/**
	 * Reset circuit breaker to initial state (for testing)
	 */
	reset(): void {
		this.state = 'CLOSED'
		this.failures = 0
		this.successes = 0
		this.lastFailureTime = null
		this.lastSuccessTime = null
		this.nextAttempt = Date.now()
	}
}

/**
 * Global circuit breaker instance for Audible API
 * Shared across all API calls
 */
let audibleCircuitBreaker: CircuitBreaker | null = null

export function getAudibleCircuitBreaker(): CircuitBreaker {
	if (!audibleCircuitBreaker) {
		audibleCircuitBreaker = new CircuitBreaker(DEFAULT_CIRCUIT_BREAKER_OPTIONS)
	}
	return audibleCircuitBreaker
}

/**
 * Reset the global circuit breaker (for testing)
 */
export function resetAudibleCircuitBreaker(): void {
	audibleCircuitBreaker = null
}

export default CircuitBreaker
