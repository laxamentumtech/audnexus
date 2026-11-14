import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { Socket } from 'node:net'

export interface ServerDrain {
	done(): Promise<void>
	forceClose(): void
}

/**
 * Portable shutdown drain for an HTTP listener.
 *
 * No native mechanism is portable across the supported runtimes (Bun >=
 * 1.3.9, Node): `server.closeAllConnections()` is a no-op on Bun 1.4.0 once
 * close() has started (native handle cleared), and on that same runtime
 * close() settles promptly WITHOUT waiting for in-flight requests — while
 * on Node close() waits for EVERY connection, including idle keep-alive
 * sockets, to end. The drain therefore tracks requests itself: it is
 * complete when every in-flight request has FINISHED (response delivered),
 * not when idle sockets close, and it ends healthy-but-idle sockets itself
 * once shutdown starts so the paired close() settles on both runtimes.
 */
export function createServerDrain(server: Server): ServerDrain {
	const open = new Set<Socket>()
	const inflightBySocket = new Map<Socket, number>()
	let inFlight = 0
	let closing = false
	let done: Promise<void> | null = null
	let settleCheck: (() => void) | null = null
	const settleSocket = (socket: Socket) => {
		const remaining = (inflightBySocket.get(socket) ?? 1) - 1
		if (remaining > 0) {
			inflightBySocket.set(socket, remaining)
			return
		}
		inflightBySocket.delete(socket)
		// Every response on this socket has finished. On Node the paired
		// close() promise waits for EVERY connection — including this now-
		// idle keep-alive socket — to end, so leaving it to the OS/client
		// would burn the whole shutdown budget. End it gracefully: FIN goes
		// out only after the queued response bytes flush (no body
		// truncation), and only after shutdown has started, so live
		// operation is untouched and no in-flight request on this socket
		// remains.
		if (closing) socket.end()
	}
	const settleRequest = (socket: Socket, res: ServerResponse, settled: { done: boolean }) => {
		if (settled.done) return
		settled.done = true
		inFlight--
		settleSocket(socket)
		settleCheck?.()
	}
	const onConnection = (socket: Socket) => {
		open.add(socket)
		socket.on('close', () => {
			open.delete(socket)
			inflightBySocket.delete(socket)
		})
	}
	// On the clean path BOTH 'finish' and 'close' fire (close follows
	// finish); on the torn-down path only 'close' fires. The per-response
	// guard makes the first one authoritative so inFlight never double-
	// counts. 'finish' is the key signal for a keep-alive socket: a healthy
	// response completes while the socket stays open — waiting for that
	// socket to close is exactly the idle-socket budget burn the drain must
	// not do.
	const onRequest = (req: IncomingMessage, res: ServerResponse) => {
		// req.socket (not res.socket): a request dispatched on a pipelined
		// socket has res.socket === null until the PRECEDING response on
		// that socket finishes, so res.socket would skip tracking the
		// request entirely — and the shared socket could be ended (or
		// force-destroyed by the drain) while the handler is still pending.
		// req.socket is the accepted connection for EVERY dispatched
		// request, already tracked by the 'connection' listener.
		const socket = req.socket
		inFlight++
		inflightBySocket.set(socket, (inflightBySocket.get(socket) ?? 0) + 1)
		const settled = { done: false }
		res.on('finish', () => settleRequest(socket, res, settled))
		res.on('close', () => settleRequest(socket, res, settled))
	}
	server.on('connection', onConnection)
	server.on('request', onRequest)
	return {
		done() {
			if (done) return done
			// Graceful idle-socket close starts HERE: src/server.ts calls
			// done() in the same block as server.close(), so the listener
			// has already stopped and no new socket can join from the
			// kernel — only already-accepted ones (which are tracked).
			closing = true
			for (const socket of open) {
				if (!inflightBySocket.has(socket)) socket.end()
			}
			done = new Promise<void>((resolve) => {
				// A request accepted after this snapshot is covered by the
				// same settle: onRequest increments inFlight unconditionally,
				// so the count cannot reach 0 while it is in flight, and its
				// finish/close runs the same settle (settleCheck stays live
				// until resolution).
				const settle = () => {
					if (inFlight === 0) {
						settleCheck = null
						resolve()
					}
				}
				settleCheck = settle
				settle()
			})
			return done
		},
		forceClose() {
			for (const socket of open) socket.destroy()
		}
	}
}

/**
 * Race `drained` (the portable "no in-flight request remains" signal)
 * against a deadline; on the deadline `force` runs and the race settles.
 * The caller starts `server.close()` BEFORE calling this, in the same
 * synchronous block as `drain.done()`, so no new request can slip between
 * the tracking and the stop of the listener.
 *
 * `timeoutMs` is the remaining aggregate shutdown budget (the caller passes
 * `remainingShutdownBudget()`, floored at 1ms). An exhausted/zero budget
 * therefore stays BOUNDED at the 1ms floor — the deadline is never
 * disabled, which is what would let a stalled request burn the whole stop
 * grace.
 */
export function closeServerWithTimeout(
	drained: Promise<unknown>,
	force: () => void,
	timeoutMs: number
): Promise<void> {
	drained.catch(() => {})
	const { promise: deadline, resolve } = Promise.withResolvers<void>()
	const timer = setTimeout(
		() => {
			force()
			resolve()
		},
		Math.max(1, timeoutMs)
	)
	return Promise.race([drained.then(() => {}), deadline]).finally(() => clearTimeout(timer))
}
