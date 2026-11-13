// Real-HTTP regression for the bounded shutdown drain. The drain must
// (a) force-destroy a stalled in-flight request's socket on the deadline —
// on Bun 1.4.0 the native server.closeAllConnections() is a no-op once
// close() has started (native handle cleared), and on that runtime close()
// settles promptly WITHOUT waiting for in-flight requests, so a drain that
// waits on close() alone, or forces with closeAllConnections, leaves a
// stalled request open past the shutdown deadline — at a POSITIVE and a
// ZERO remaining budget; (b) NOT wait for idle keep-alive sockets — a
// healthy response that finishes with its socket left open must not burn
// the shutdown budget (Node's close() promise waits for EVERY connection,
// so the drain ends healthy-but-idle sockets itself once shutdown starts,
// after the response bytes have flushed); and (c) let a socket the kernel
// had queued join the SAME completion notification when its request
// arrives AFTER done() started — it must be served intact, not force-killed.
// These tests assert on the real client's fate (request settles / stays
// pending, full response body, elapsed time) — not on a spy being called.
// Real timers are deliberate: the deadlines are real wall clocks, as in the
// closeWithTimeout/withDeadline tests (Bun fake-timer interop deadlocks
// them).

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { once } from 'node:events'
import { createServer, type Server, type ServerResponse } from 'node:http'
import { createConnection, type Socket } from 'node:net'

import { closeServerWithTimeout, createServerDrain, type ServerDrain } from '#helpers/utils/httpShutdown'

/** Start an in-flight request: the handler never responds, so the request
 * promise stays pending until the server destroys the socket (force) or
 * the caller aborts (teardown). */
function stallFetch(port: number, init: RequestInit = {}): { request: Promise<unknown>; abort: () => void } {
	const controller = new AbortController()
	const request = fetch(`http://127.0.0.1:${port}/stall`, { ...init, signal: controller.signal })
	// The rejection lands on the force (or the teardown abort); observe it
	// so it never surfaces as an unhandled rejection.
	return { request: request.catch((err: unknown) => err), abort: () => controller.abort() }
}

/** Bounded stop of the test listener. */
async function stopTestServer(server: Server): Promise<void> {
	if (!server.listening) return
	try {
		server.close()
	} catch {
		return
	}
	await Promise.race([
		once(server, 'close'),
		new Promise<void>((resolve) => setTimeout(resolve, 500))
	])
}

/** Gate on the server having accepted `count` live connections (bounded,
 * so a regression fails instead of parking the runner). */
async function expectConnections(server: Server, count: number): Promise<void> {
	for (let i = 0; i < 200; i++) {
		const connections = await new Promise<number | null>((resolve) => {
			server.getConnections((err, n) => resolve(err ? null : n))
		})
		if (connections !== null && connections >= count) return
		await new Promise((resolve) => setTimeout(resolve, 5))
	}
	throw new Error(`expected ${count} live connections`)
}

describe('createServerDrain + closeServerWithTimeout (real HTTP)', () => {
	let server: Server
	let port: number
	let drain: ServerDrain

	beforeEach(async () => {
		server = createServer((req, res) => {
			if (req.url === '/stall' || req.url === '/gate') return
			if (req.url === '/slow') {
				// Completes ~120ms out.
				setTimeout(() => res.end('slow-ok'), 120)
				return
			}
			res.end('ok')
		})
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject)
			server.listen(0, '127.0.0.1', () => {
				server.off('error', reject)
				resolve()
			})
		})
		port = server.address()?.port ?? 0
		// The drain is created before any client connects (as in
		// src/server.ts, right after fastify() and before listen settles),
		// so every socket below is tracked from its 'connection' event.
		drain = createServerDrain(server)
	})

	afterEach(async () => {
		await stopTestServer(server)
	})

	for (const budgetMs of [0, 50]) {
		test(`a stalled request is force-closed on the deadline (budget ${budgetMs}ms): the client fails and the close is bounded`, async () => {
			const stalled = stallFetch(port)
			try {
				await expectConnections(server, 1)
				// Capture the listener close BEFORE close() starts: on Bun
				// close() emits 'close' immediately (without draining), so
				// a listener attached afterwards would never fire.
				const closed = once(server, 'close').then(() => true)
				// The production sequence (src/server.ts): the drain
				// snapshot and the listener stop happen back-to-back,
				// before any await.
				const drained = drain.done()
				server.close()
				const started = Date.now()
				// budgetMs 0 simulates an exhausted aggregate budget: the
				// deadline must stay BOUNDED at the 1ms floor, not
				// disabled. The stalled request never finishes, so the
				// force lands at the deadline in both cases.
				await closeServerWithTimeout(drained, drain.forceClose, budgetMs)
				const elapsed = Date.now() - started
				expect(elapsed).toBeLessThan(1000)
				// The force is REAL, not a spy call: the stalled client
				// settled with a connection failure (it was unblocked — a
				// no-op force would leave it pending and this would hang
				// to the test timeout).
				const settled = await stalled.request
				expect(settled instanceof Response).toBe(false)
				// The listener stopped accepting within a bounded window.
				expect(await Promise.race([closed, new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 500))])).toBe(true)
			} finally {
				stalled.abort()
			}
		})
	}

	test('a completed keep-alive response drains before the deadline: intact body, force not called, idle socket ended by the drain', async () => {
		const res = await fetch(`http://127.0.0.1:${port}/ok`)
		expect(res.status).toBe(200)
		// Consume the body: on a keep-alive socket the response is fully
		// delivered while the socket stays open — exactly the idle-linger
		// shape (observed on both Bun 1.4.0 and Node 24) that used to burn
		// the whole budget.
		expect(await res.text()).toBe('ok')
		const force = mock()
		const drained = drain.done()
		server.close()
		const started = Date.now()
		// 50ms budget: no in-flight request remains, so the drain settles
		// immediately and the drain itself ends the now-idle socket (FIN
		// after the flushed response bytes), so Node's close() promise
		// settles too. A force would only fire if the drain waited on the
		// idle socket.
		await closeServerWithTimeout(drained, force, 50)
		expect(force).not.toHaveBeenCalled()
		expect(Date.now() - started).toBeLessThan(1000)
		// The paired listener close settles promptly on the settled drain.
		await Promise.race([
			once(server, 'close'),
			new Promise<void>((resolve) => setTimeout(resolve, 500))
		])
	})

	test('an idle keep-alive client receives the server FIN when the drain starts, while the listener is still open', async () => {
		// Raw keep-alive client: a prior response fully consumed, the socket
		// held open (keep-alive semantics — no Connection: close, so
		// nothing else closes it).
		const socket = createConnection({ host: '127.0.0.1', port })
		try {
			socket.write('GET /ok HTTP/1.1\r\nhost: localhost\r\n\r\n')
			// Read the keep-alive response off DATA (body-complete) — NOT
			// off 'end': a keep-alive response never ends the socket, and a
			// 'end' listener installed here would CONSUME the server FIN the
			// later observer is meant to see. 'data' fires before 'end', so
			// this leaves the socket open and the FIN unobserved.
			let buf = ''
			const response = new Promise<string>((resolve, reject) => {
				const onData = (chunk: Buffer) => {
					buf += chunk
					const i = buf.indexOf('\r\n\r\n')
					if (i >= 0) {
						socket.off('data', onData)
						resolve(buf.slice(i + 4))
					}
				}
				socket.on('data', onData)
				socket.once('error', reject)
			})
			const body = await response
			expect(body).toBe('ok')
			// Install the FIN observer BEFORE draining: the server FIN is
			// what the client sees as 'end' after the response bytes.
			const fin = new Promise<void>((resolve, reject) => {
				socket.once('end', resolve)
				socket.once('error', reject)
			})
			const drained = drain.done()
			// NO server.close() here: the listener is still open, so a
			// missing drain-owned socket.end cannot be masked by the
			// listener close.
			const started = Date.now()
			await Promise.race([drained, new Promise<never>((_, reject2) => setTimeout(() => reject2(new Error('drain hung')), 1000))])
			// The idle keep-alive client actually received the server FIN
			// from the drain — bounded.
			const finTimeout = new Promise<never>((_, reject2) => setTimeout(() => reject2(new Error('no FIN within 1000ms')), 1000))
			await Promise.race([fin, finTimeout])
			expect(Date.now() - started).toBeLessThan(1000)
		} finally {
			socket.destroy()
			// Isolated cleanup: stop the listener (which is still open
			// after the FIN proof) so nothing leaks between tests.
			server.close()
			await Promise.race([
				once(server, 'close'),
				new Promise<void>((resolve) => setTimeout(resolve, 500))
			])
		}
	})

	test('a client that destroys its stalled socket lets the drain finish before the deadline, without force', async () => {
		// Stalled request: the handler never responds. The request-entry
		// signal is the server's own 'request' event.
		const entered = new Promise<Socket>((resolve) => {
			server.once('request', (req, res) => {
				if (req.url === '/stall') resolve(res.socket)
			})
		})
		const controller = new AbortController()
		const request = fetch(`http://127.0.0.1:${port}/stall`, { signal: controller.signal })
		// The rejection lands on the client's own destroy (or the teardown
		// abort); observe it so it never surfaces unhandled.
		const settled = request.catch((err: unknown) => err)
		const stalledSocket = await entered
		try {
			const force = mock()
			const drained = drain.done()
			server.close()
			// The CLIENT destroys its stalled socket before the deadline:
			// the response gets 'close' WITHOUT 'finish' — the drain must
			// complete on that settle, not by force-destroying the socket
			// itself at the deadline.
			stalledSocket.destroy()
			const started = Date.now()
			await closeServerWithTimeout(drained, force, 200)
			expect(Date.now() - started).toBeLessThan(200)
			expect(force).not.toHaveBeenCalled()
			// The client observed its own destruction, not a response.
			const outcome = await settled
			expect(outcome instanceof Response).toBe(false)
		} finally {
			controller.abort()
			await Promise.race([
				once(server, 'close'),
				new Promise<void>((resolve) => setTimeout(resolve, 500))
			])
		}
	})

	test('a request accepted AFTER done() starts joins the same drain: served intact, no force', async () => {
		// Deterministic event gates, no connection-count polling.
		// Request A: the /gate handler never responds on its own — the
		// test holds it pending and releases it explicitly.
		const gated = new Promise<ServerResponse>((resolve) => {
			server.once('request', (req, res) => {
				if (req.url === '/gate') resolve(res)
			})
		})
		const a = fetch(`http://127.0.0.1:${port}/gate`).then((r) => r.text())
		const resA = await gated
		// The snapshot: A in flight holds the drain pending.
		const drained = drain.done()
		// Request B: a NEW socket accepted WHILE THE LISTENER IS STILL
		// OPEN — after done() started, so a snapshot-only completion
		// notification would never see it (and a force would kill it).
		const nextAccepted = new Promise<Socket>((resolve) => {
			const onConn = (socket: Socket) => {
				server.off('connection', onConn)
				resolve(socket)
			}
			server.on('connection', onConn)
		})
		const b = createConnection({ host: '127.0.0.1', port })
		b.once('error', () => {})
		await nextAccepted
		b.write('GET /ok HTTP/1.1\r\nhost: localhost\r\nconnection: close\r\n\r\n')
		// NOW stop the listener, then complete BOTH requests.
		server.close()
		resA.end('a-ok')
		const bodyA = await a
		const bodyB = await new Promise<string>((resolve, reject) => {
			let buf = ''
			b.once('data', (chunk: Buffer) => {
				buf += chunk
			})
			b.once('end', () => {
				const i = buf.indexOf('\r\n\r\n')
				resolve(i >= 0 ? buf.slice(i + 4) : buf)
			})
			b.once('error', reject)
		})
		const force = mock()
		const started = Date.now()
		// The drain must settle when both requests FINISH — the late one
		// included — inside the budget, with no force.
		await closeServerWithTimeout(drained, force, 500)
		expect(bodyA).toBe('a-ok')
		expect(bodyB).toBe('ok')
		expect(force).not.toHaveBeenCalled()
		expect(Date.now() - started).toBeLessThan(500)
		// The paired listener close settles once both sockets are gone.
		await Promise.race([
			once(server, 'close'),
			new Promise<void>((resolve) => setTimeout(resolve, 500))
		])
	})

	test('forceClose is idempotent and safe after the server closed (no tracked sockets left to keep alive)', async () => {
		const stalled = stallFetch(port)
		try {
			await expectConnections(server, 1)
			drain.forceClose()
			drain.forceClose()
			const settled = await stalled.request
			expect(settled instanceof Response).toBe(false)
			server.close()
			await once(server, 'close')
			expect(() => drain.forceClose()).not.toThrow()
		} finally {
			stalled.abort()
		}
	})

	test('forceClose only destroys sockets open at force time: a later request is served', async () => {
		const stalled = stallFetch(port)
		try {
			await expectConnections(server, 1)
			drain.forceClose()
			// A request that arrives AFTER the force must be served
			// normally: the tracker acted on what was open at the force.
			const res = await fetch(`http://127.0.0.1:${port}/ok`)
			expect(res.status).toBe(200)
			expect(await res.text()).toBe('ok')
		} finally {
			stalled.abort()
		}
	})
})

describe('closeServerWithTimeout on a real Fastify app', () => {
	test('a stalled Fastify request is force-closed on the deadline under the real app surface', async () => {
		const { fastify } = await import('fastify')
		const app = fastify({ logger: false, disableRequestLogging: true })
		app.get('/stall', () => {
			// Never resolve: the handler that outlives a SIGTERM.
			return new Promise<never>(() => {})
		})
		await app.listen({ port: 0, host: '127.0.0.1' })
		const port = app.server.address()?.port ?? 0
		// Before any request, as in src/server.ts.
		const drain = createServerDrain(app.server)
		const stalled = stallFetch(port)
		try {
			// Gate on the stalled socket arriving.
			await new Promise<void>((resolve) => {
				const tick = () => {
					app.server.getConnections((err, n) => {
						if (!err && n >= 1) resolve()
						else setTimeout(tick, 5)
					})
				}
				setTimeout(tick, 5)
			})
			const drained = drain.done()
			const appClose = app.close()
			appClose.catch(() => {})
			const started = Date.now()
			// On Node app.close() would hang on the stalled request; the
			// bounded drain must not wait for it. 50ms budget: the stalled
			// request never finishes, so the force lands at the deadline.
			await closeServerWithTimeout(drained, drain.forceClose, 50)
			expect(Date.now() - started).toBeLessThan(1000)
			// The real surface: the stalled client settled with a
			// connection failure (unblocked — a no-op force would leave it
			// pending forever and this would hang to the test timeout).
			const settled = await stalled.request
			expect(settled instanceof Response).toBe(false)
			// The listener stopped accepting; its close settles once the
			// in-flight socket is gone (bounded, in case a regression
			// leaves it behind).
			await Promise.race([
				appClose,
				new Promise<void>((resolve) => setTimeout(resolve, 1000))
			])
		} finally {
			stalled.abort()
		}
	})

	test('a healthy in-flight request finishes under shutdown: intact body, paired drain + app.close settle before the deadline, no force', async () => {
		const { fastify } = await import('fastify')
		const app = fastify({ logger: false, disableRequestLogging: true })
		let resolveSlow: (() => void) | null = null
		app.get('/slow', async () => {
			await new Promise<void>((r) => {
				resolveSlow = r
			})
			return 'slow-ok'
		})
		await app.listen({ port: 0, host: '127.0.0.1' })
		const port = app.server.address()?.port ?? 0
		const drain = createServerDrain(app.server)
		const force = mock()
		const res = fetch(`http://127.0.0.1:${port}/slow`)
		// Gate on the request being in flight at the listener.
		await new Promise<void>((resolve) => {
			const tick = () => {
				app.server.getConnections((err, n) => {
					if (!err && n >= 1) resolve()
					else setTimeout(tick, 5)
				})
			}
			setTimeout(tick, 5)
		})
		// The production sequence: done() and close() back-to-back.
		const drained = drain.done()
		const appClose = app.close()
		appClose.catch(() => {})
		// Finish the in-flight response mid-drain (handler completes,
		// body fully written) — the keep-alive socket now idles.
		resolveSlow?.()
		const body = await res.then((r) => r.text())
		expect(body).toBe('slow-ok')
		const started = Date.now()
		// The PAIRED close (drain + app.close) must settle BEFORE the
		// 500ms deadline without force: Node's close() waits for every
		// connection, so a drain that leaves the idle keep-alive socket to
		// the OS/client would make this race to the deadline and force.
		await closeServerWithTimeout(drained, force, 500)
		expect(Date.now() - started).toBeLessThan(500)
		expect(force).not.toHaveBeenCalled()
		await Promise.race([
			appClose,
			new Promise<void>((resolve) => setTimeout(resolve, 500))
		])
	})
})
