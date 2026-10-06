import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { connect, type Socket } from 'node:net'
import type { Duplex } from 'node:stream'
import type { AddressInfo } from 'node:net'
import { resolvePublicSourceAddress, type SourceResolver } from './source-http.server'
import { proxyEndpointSchema, type SourceProxy } from '~/features/sources/source-routing.schemas'

/** Tunnel only: Chromium retains its own end-to-end TLS handshake and SNI. */
export async function createBrowserSourceRelay(hostname: string, proxy?: SourceProxy, resolver?: SourceResolver) {
  const sockets = new Set<Duplex>()
  let used = false
  const server = createServer((_request, response) => { response.writeHead(405); response.end() })
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
  server.on('connect', async (request, client, head) => {
    let upstream: Socket | undefined
    client.on('error', () => upstream?.destroy())
    try {
      const target = new URL(`https://${request.url}`)
      if (used || target.hostname !== hostname || target.port && target.port !== '443' || target.username || target.password || target.pathname !== '/')
        throw new Error('Tunnel outside this source request')
      used = true
      const pinned = await resolvePublicSourceAddress(hostname, resolver)
      if (proxy) {
        const endpoint = new URL(proxyEndpointSchema.parse(proxy.endpoint))
        upstream = await new Promise<Socket>((resolve, reject) => {
          const authority = `${pinned.family === 6 ? `[${pinned.address}]` : pinned.address}:443`
          const tunnel = (endpoint.protocol === 'https:' ? httpsRequest : httpRequest)({
            protocol: endpoint.protocol, hostname: endpoint.hostname, port: endpoint.port || undefined,
            method: 'CONNECT', path: authority, agent: false,
            headers: { host: authority, ...(proxy.username || proxy.password ? { 'proxy-authorization': `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}` } : {}) },
            signal: AbortSignal.timeout(15000),
          })
          tunnel.once('connect', (response, socket, initial) => {
            if (response.statusCode !== 200) { socket.destroy(); reject(new Error('Source proxy rejected browser tunnel')); return }
            if (initial.length) socket.unshift(initial)
            resolve(socket)
          })
          tunnel.once('error', () => reject(new Error('Source proxy browser tunnel failed; no direct fallback')))
          tunnel.end()
        })
      } else {
        upstream = await new Promise<Socket>((resolve, reject) => {
          const socket = connect({ host: pinned.address, port: 443, family: pinned.family })
          socket.setTimeout(15000, () => socket.destroy(new Error('Source tunnel deadline exceeded')))
          socket.once('error', reject)
          socket.once('connect', () => { socket.setTimeout(0); resolve(socket) })
        })
      }
      sockets.add(upstream)
      upstream.once('close', () => { sockets.delete(upstream!); client.destroy() })
      client.once('close', () => upstream?.destroy())
      upstream.on('error', () => client.destroy())
      if (client.destroyed) { upstream.destroy(); return }
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) upstream.write(head)
      upstream.pipe(client); client.pipe(upstream)
    } catch { upstream?.destroy(); client.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n') }
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: async () => {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>(resolve => server.close(() => resolve()))
  } }
}
