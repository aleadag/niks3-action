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

The action runs in two phases:

1.  **Main Phase:**
    *   **Snapshot:** Takes a snapshot of the current Nix store.
    *   **Install:** Installs `niks3` (it will be cached in the post phase!).
    *   **Configure:** Sets up AWS credentials if provided.
2.  **Post Phase (Runs after job steps):**
    *   **Diff:** Compares the current Nix store with the initial snapshot.
    *   **Filter:** Selects new paths (ignoring `.drv` and build locks).
    *   **Push:** Uploads the new paths to the configured `niks3` endpoint.

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
