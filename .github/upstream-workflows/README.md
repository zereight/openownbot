# Workflows of the original project

These files are the workflows of nightly-labs/openbot, kept here as a reference. GitHub runs only
`.github/workflows/`, so none of them runs in this repository. They need the original project's
secrets (Apple and Azure signing, Cloudflare, Discord, a Docker registry) and its servers.

OpenOwnBot's own workflows are `ci.yml` and `release.yml` in `.github/workflows/`. To take an idea
from one of these files, copy the part you need into a new workflow and remove what names the
original project's infrastructure.
