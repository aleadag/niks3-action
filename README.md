# niks3-action

![CI](https://github.com/aleadag/niks3-action/actions/workflows/ci.yml/badge.svg)

A GitHub Action to setup [niks3](https://github.com/Mic92/niks3) and manage caching for Nix derivations. This action optimizes your Nix builds by automatically identifying new store paths and pushing them to your `niks3` cache server.

## Features

*   **Automatic Installation:** Installs `niks3` on the runner.
*   **Smart Caching:** Calculates the difference in the Nix store before and after the job, pushing only new paths.
*   **OIDC Support:** Authenticate with your `niks3` server using GitHub Actions OIDC tokens (no long-lived secrets required).
*   **AWS Configuration:** Helper to configure AWS credentials for Nix S3 substituters.

## Usage

### Inputs

| Input | Description | Required | Default |
| :--- | :--- | :--- | :--- |
| `endpoint` | The URL of the `niks3` server. | **Yes** | N/A |
| `auth-token` | Authentication token for the `niks3` server. Optional if `use-oidc` is true. | No | N/A |
| `use-oidc` | Use GitHub Actions OIDC token for authentication. | No | `false` |
| `oidc-audience` | Custom audience for the OIDC token. Defaults to `endpoint` if not set. | No | N/A |
| `aws-access-key-id` | AWS Access Key ID for Nix S3 substituter. | No | N/A |
| `aws-secret-access-key` | AWS Secret Access Key for Nix S3 substituter. | No | N/A |
| `max-concurrent-uploads` | Maximum concurrent uploads. | No | `30` |
| `skip-push` | If `true`, disables pushing to the cache. | No | `false` |
| `use-daemon` | Use post-build-hook with nix-daemon for pushing. Set to `false` for environments without systemd. | No | `true` |
| `push-flake-inputs` | If `true`, pushes the current flake's inputs to the cache. | No | `false` |

### Examples

#### Basic Usage (Token Auth)

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: cachix/install-nix-action@v27
  - uses: aleadag/niks3-action@v0
    with:
      endpoint: "https://my-niks3-server.com"
      auth-token: "${{ secrets.NIKS3_TOKEN }}"
      push-flake-inputs: true
```

#### OIDC Authentication (Recommended)

Eliminate long-lived secrets by using OIDC:

```yaml
permissions:
  id-token: write # Required for OIDC
  contents: read

steps:
  - uses: actions/checkout@v4
  - uses: cachix/install-nix-action@v27
  - uses: aleadag/niks3-action@v0
    with:
      endpoint: "https://my-niks3-server.com"
      use-oidc: true
```

#### Without systemd (`use-daemon: false`)

Self-hosted runners often run as containers that share the host's nix-daemon and lack their own systemd. In such environments, set `use-daemon: false` to use diff-based pushing instead of the post-build-hook.

```yaml
permissions:
  id-token: write
  contents: read

steps:
  - uses: actions/checkout@v4
  - uses: aleadag/niks3-action@v0
    with:
      endpoint: "https://my-niks3-server.com"
      use-oidc: true
      use-daemon: false
  - run: nix build .#mypackage
  # New store paths are automatically pushed in the post phase
```

#### With AWS S3 Substituters

If your cache uses S3 as a backend and requires credentials:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: cachix/install-nix-action@v27
    with:
      extra_nix_config: |
        extra-substituters = s3://nix-cache?endpoint=...
  - uses: aleadag/niks3-action@v0
    with:
      endpoint: "https://my-niks3-server.com"
      use-oidc: true
      aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
      aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

## How It Works

The action supports two modes for pushing derivations to the cache.

### Daemon mode (default, `use-daemon: true`)

Sets up a post-build-hook in Nix to automatically upload derivations as they are built. Requires systemd (nix-daemon).

1.  **Installation:** Builds and installs `niks3` from nixpkgs. Configures AWS credentials for Nix S3 substituters if provided.
2.  **Authentication:** If OIDC is enabled, starts a background systemd service that refreshes GitHub Actions OIDC tokens. If an auth-token is provided, writes the static token to a file.
3.  **Post-Build Hook:** Configures Nix to use a custom shell script as a `post-build-hook`. This script runs `niks3 push` for every path Nix builds.

### Store-scan mode (`use-daemon: false`)

For environments where systemd is not available.

1.  **Pre-build snapshot:** Captures a snapshot of all store paths under `/nix/store` before the build starts.
2.  **Post-build diff:** After the build, computes the difference between the snapshot and the current store paths, validates them with `nix path-info`, and pushes new paths in batches.

### Common

*   **Flake Inputs (Optional):** If `push-flake-inputs` is enabled, it runs `nix flake archive --json` and pushes all inputs to the cache immediately after installation.

## Development

This project uses **Nix** for a consistent development environment and **Biome** for code quality.

```bash
# Enter dev environment
nix develop

# Install dependencies
pnpm install

# Build the action
pnpm run build

# Format & Lint
pnpm run check
```
