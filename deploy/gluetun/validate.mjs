import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('.', import.meta.url))
// Explicit placeholder values; never render or print deployment credentials.
const env = {
  PATH: process.env.PATH,
  STACK_DIR: '/opt/gluetun',
  GATEWAY_NETWORK: 'validation-gateway',
  PROTON_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  VPN_PROXY_USER: 'validation',
  VPN_PROXY_PASS: 'validation-only',
  GLUETUN_API_KEY: 'validation-only',
  COMPANION_SECRET_KEY: 'validation-only',
}
const args = ['compose', '--env-file', '/dev/null', '-f', 'compose.yaml', 'config', '--format', 'json']
const config = JSON.parse(execFileSync('docker', args, { cwd, env, encoding: 'utf8' }))
assert.equal(config.name, 'gluetun')
assert.equal(config.networks.glue_net.name, 'glue_net')
assert.equal(config.networks['docker-api'].internal, true)
assert.equal(config.networks.gateway.external, true)
assert.equal(config.networks.gateway.name, env.GATEWAY_NETWORK)
assert.deepEqual(Object.keys(config.services['socket-proxy'].networks), ['docker-api'])
assert.equal(config.services['socket-proxy'].ports?.length ?? 0, 0)
assert.equal(config.services.companion.ports?.length ?? 0, 0)
assert.equal(config.services.gluetun.networks.gateway, undefined)
assert.equal(config.services.companion.environment.COMPOSE_PROJECT, 'gluetun')
assert.equal(config.services.companion.environment.COMPOSE_DIR, env.STACK_DIR)
assert.equal(config.services.companion.environment.GLUETUN_HOST, 'gluetun')
assert.equal(config.services.companion.environment.SIDECAR_HOST, 'host.docker.internal')
assert(config.services.companion.volumes.some(v => v.source === env.STACK_DIR && v.target === env.STACK_DIR && !v.read_only))
assert.equal(config.services.companion.depends_on.gluetun.condition, 'service_started')
for (const port of config.services.gluetun.ports) assert.equal(port.host_ip, '127.0.0.1')
assert.equal(config.services.gluetun.environment.VPN_PORT_FORWARDING, 'off')
assert.equal(config.services.gluetun.environment.HTTPPROXY, 'on')
assert.equal(JSON.parse(config.services.gluetun.environment.HTTP_CONTROL_SERVER_AUTH_DEFAULT_ROLE).auth, 'apikey')
for (const key of ['STACK_DIR', 'GATEWAY_NETWORK', 'PROTON_KEY', 'VPN_PROXY_USER', 'VPN_PROXY_PASS', 'GLUETUN_API_KEY', 'COMPANION_SECRET_KEY']) {
  const missing = { ...env }
  delete missing[key]
  const result = spawnSync('docker', args, { cwd, env: missing, encoding: 'utf8' })
  if (result.error) throw result.error
  assert.notEqual(result.status, 0, `${key} must be required`)
}
console.log('Compose configuration, network isolation, paths, and required settings validated; no deployment performed.')
