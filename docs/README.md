# Hoardcore docs site

This directory is reserved for the public Hoardcore documentation and project site.

The initial site is deliberately static and build-tool-free so it can be published directly by a static host. As documentation grows, this directory can move to a documentation framework without coupling that choice to the application runtime.

The front page should remain focused on what Hoardcore is, why someone would self-host it, and links into practical installation/module documentation once those docs exist.

## Cloudflare Pages

The site is static and can be deployed directly from this repository:

- Framework preset: none
- Root directory: `/`
- Build command: `exit 0`
- Build output directory: `docs`

Add the production hostname through the Pages project's **Custom domains** screen after the first successful deployment. The `_headers` file is part of the published output and supplies the site's baseline browser security policy.
