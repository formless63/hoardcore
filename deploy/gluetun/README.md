# Shared Gluetun / Companion stack

This optional infrastructure stack is separate from the Hoardcore application.
Its Compose project is `gluetun`, its reusable VPN-client network is `glue_net`,
and Companion's container name is `gluetun-companion`. Creating or joining this
network alone does not change a client's outbound routing.

## Prepare the host

Copy this directory to the host path selected as `STACK_DIR` (for example
`/opt/gluetun`). Copy `.env.example` to `.env`, fill the blank secrets, and set
`GATEWAY_NETWORK` to the existing network used by the gateway's local connector.
Run all host Compose commands from that stack directory. When using a stack UI,
ensure it deploys the actual `compose.yaml` and private `.env` at this path;
Companion needs those files to persist switches and recreate Gluetun.

### Pasting into Dockhand

Create the stack named `gluetun` on the intended Docker environment. Paste
`compose.yaml` into the YAML editor and the completed `.env.example` values into
the stack environment editor. For Hawser, set `STACK_DIR` to the host's actual
`<STACKS_DIR>/gluetun` directory; the default is `/data/stacks/gluetun`. A native
Hawser service uses host paths directly. If Hawser runs in Docker, determine the
host side of its stacks bind mount instead of assuming its internal path is valid.

Before testing a server switch, verify that the host stack directory contains
the deployed Compose file and its interpolation inputs. Dockhand may stage a
resolved manifest rather than the original placeholders; if placeholders remain,
Companion's independent Compose invocation needs the corresponding `.env` values
in that directory. Stack variables visible only to Dockhand are not automatically
available to Companion's later commands.

Dockhand and Companion are separate configuration writers. Companion saves its
server/profile choices in a local Compose override. After a switch, verify that
the override survives and is included in later Dockhand deployments; a deployment
using only the base file can revert the selected server. Back up both the base and
override before editing or redeploying the stack in Dockhand.

See the [Dockhand manual](https://dockhand.pro/manual/) and
[Hawser stack-directory configuration](https://github.com/Finsys/hawser#configuration).

The host needs Docker Compose, `/dev/net/tun`, and that gateway network. Generate
independent proxy and Companion secrets with `openssl rand -hex 32`; generate
the control key with `docker run --rm qmcgaw/gluetun:v3.41.3 genkey`.
Get the Proton private key from a generated WireGuard configuration. Leave
`wg0.conf` absent from `data/gluetun/wireguard/` for Companion-managed server
selection. An endpoint pinned in that file takes precedence over server filters.

```sh
chmod 600 .env
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 gluetun companion
```

There is no automatic rotation policy selected by this template. Configure a
VPN profile and an explicit rotation pool/schedule in Companion after verifying
the initial connection. Keep automated dependent-container management disabled
until the intended clients are connected and their recreation behavior is tested.

## Gateway resource

Attach the gateway connector and Companion to the same `GATEWAY_NETWORK`.
Configure an authenticated HTTPS resource with target:

```text
http://gluetun-companion:8765
```

The external resource hostname is an installation choice, not a Compose setting.
Companion publishes no host UI port. There is no gateway connection for the
socket proxy or Gluetun itself. Their APIs are not resource targets. Complete
Companion's initial account setup through the authenticated resource before
granting other users access.

## Companion onboarding

1. Create the initial Companion administrator account and complete onboarding.
2. Configure proxy credentials in **Settings** using `VPN_PROXY_USER` and
   `VPN_PROXY_PASS` from the private `.env`; these are not Companion env settings.
3. Configure Gluetun control access in **Settings → VPN forwarded ports**:
   URL `http://gluetun:8000`, X-API-Key from `GLUETUN_API_KEY`. This does not require
   enabling Proton port forwarding; that remains off for outbound HTTP usage.
4. Create/import a Proton WireGuard VPN profile with the main private key. Keep
   the main and optional benchmark-sidecar credentials distinct where needed.
5. Import/select servers, test a manual switch, then choose the desired rotation
   pool and schedule. The supported onboarding wording can vary by image version.

Companion reaches the proxy by Docker DNS (`gluetun:8888`). Benchmark sidecars
can publish temporary host ports, so `SIDECAR_HOST` separately points to
`host.docker.internal`. No whole-host stack-directory mount is included; this
template mounts only its own `STACK_DIR`. Cross-project client recreation may
require additional, explicitly selected stack mounts and `COMPOSE_STACKS_DIR`.

## Other Docker stacks

Proxy-capable clients can preserve their existing database/gateway networks and
add the shared network:

```yaml
services:
  your-client:
    networks: [default, glue_net]
    environment:
      HTTP_PROXY: "http://${VPN_PROXY_USER}:${VPN_PROXY_PASS}@gluetun:8888"
      HTTPS_PROXY: "http://${VPN_PROXY_USER}:${VPN_PROXY_PASS}@gluetun:8888"
      NO_PROXY: "localhost,127.0.0.1,db"
networks:
  glue_net:
    external: true
    name: glue_net
```

Each client needs its own credential configuration and an HTTP implementation
that uses proxy settings. Percent-encode credentials in URLs if necessary.
There is no direct-egress fallback configured here, but a client's own proxy
handling determines whether it can fall back. Verify the actual client exit IP
and its behavior while the VPN is stopped before relying on that routing.
Hoardcore uses its explicit per-source routing settings instead of these
environment variables. See the wiring instructions below.

### Hoardcore source routing

Attach only the application to the shared network, retaining its database and
gateway networks:

```bash
docker compose -f compose.yaml -f compose.gateway.yaml -f compose.proxy.yaml up -d app
```

Omit the gateway overlay if that installation does not use it. The optional
`SOURCE_PROXY_NETWORK` selects an external network other than `glue_net`.
Keep the same overlays selected when recreating/upgrading the app.

In **Sources → Network routing**, select **HTTP CONNECT proxy**, enter
`http://gluetun:8888`, and save the Gluetun HTTP proxy username and password.
These are the proxy credentials, not Companion's login or Gluetun control API
key. Settings are source-specific; other sources remain direct until configured.
The password is encrypted in PostgreSQL and is never returned to the browser.
Leaving the password blank retains it; changing the proxy address/username
requires re-entering or explicitly clearing it. Selecting direct removes the
stored credentials. Keep `INTEGRATION_ENCRYPTION_KEY` (when set) or
`BETTER_AUTH_SECRET` stable so saved passwords remain readable.

Catalog, stock supplements, robots.txt, and media use the selected route. The
transport connects the proxy to a validated public destination IP while
preserving the original TLS hostname and HTTP Host header. Proxy rejection or
unavailability stops the request without a direct fallback. Origin cooldowns,
retry budgets, scan intervals, and request ceilings remain in force across VPN
switches. Database, login, gateway, and notification traffic are not rerouted.
Companion can switch the VPN without recreating Hoardcore: new proxy connections
use Docker DNS to find Gluetun. In-flight requests may fail during a switch and
receive the configured network-error response policy.

Full-tunnel clients in another Compose stack can instead use
`network_mode: "container:gluetun"`, without their own `networks` or `ports`.
Publish needed inbound ports on Gluetun and list them in `FIREWALL_INPUT_PORTS`.
All such clients share one network namespace and exit; account for port conflicts
and recreate the clients when Gluetun is recreated. Add only required private
network exceptions to `FIREWALL_OUTBOUND_SUBNETS`, avoiding tunnel-range overlap.

## Privileges, persistence, and upgrades

Companion has writable access to its stack directory and Docker container,
image, network, volume, and event APIs through a socket proxy. These permissions
are powerful host-administration permissions, not a container-name sandbox;
the socket's read-only bind mount does not make its API read-only. The separate
internal Docker-API network reduces exposure, but does not limit Companion to
managing one host container. Gateway authentication and Companion's own login
protect access to this privileged UI.

Companion is beta upstream and primarily tested with AirVPN. Pin tested image
digests through `.env` before promoting a tested release. Back up the private
`.env`, `data/`, and generated Compose override before upgrades. Retain
`COMPANION_SECRET_KEY` to preserve the ability to read encrypted credentials.
Use `docker compose up -d` without an explicit `-f` to load Companion's generated
`compose.override.yaml`; omitting it would discard selected profile/server
overrides. Do not commit runtime data, secret files, or generated overrides.

## Offline validation

From this directory run `node validate.mjs`. It uses placeholder values and
Docker Compose configuration rendering only: no Docker daemon, VPN credentials,
image pulls, deployment, or source requests are needed.

Upstream references:

- [Companion setup and Proton profile requirements](https://github.com/Aerya/Gluetun-Companion/blob/main/README.en.md)
- [Companion's reference Compose](https://github.com/Aerya/Gluetun-Companion/blob/main/docker-compose.yml)
- [Gluetun HTTP proxy](https://github.com/qdm12/gluetun-wiki/blob/main/setup/options/http-proxy.md)
- [Gluetun container routing](https://github.com/qdm12/gluetun-wiki/blob/main/setup/connect-a-container-to-gluetun.md)
- [Docker socket proxy permissions](https://github.com/Tecnativa/docker-socket-proxy)
