# Hoardcore docs site

This directory contains the public Hoardcore project site and deployment documentation.

The site is deliberately static and build-tool-free so it can be published directly by a static host. As documentation grows, this directory can move to a documentation framework without coupling that choice to the application runtime.

The front page focuses on what Hoardcore does today, why someone would self-host it, and links into practical installation guidance. Keep claims tied to implemented functionality.

The application deployment guide is available at [deployment.md](deployment.md).
The implemented HTTP endpoint reference is at [api.html](api.html), with its
machine-readable OpenAPI 3.1 specification at [openapi.yaml](openapi.yaml).
The release policy and first-release gate are in [releases.md](releases.md).

## Cloudflare Pages

The site is static and can be deployed directly from this repository:

- Framework preset: none
- Root directory: `/`
- Build command: `exit 0`
- Build output directory: `docs`

Add the production hostname through the Pages project's **Custom domains** screen after the first successful deployment. The `_headers` file is part of the published output and supplies the site's baseline browser security policy.
