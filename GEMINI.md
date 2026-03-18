# niks3-action

This project is a GitHub Action that installs `niks3` and manages caching for Nix derivations. It is designed to speed up Nix builds in GitHub Actions by pushing new store paths to a `niks3` server.

## Overview

The action supports two modes:

#### Daemon mode (default, `use-daemon: true`)
1.  **Main Phase (`src/stages/install.ts`):**
    *   Installs `niks3` from `nixpkgs` and adds it to the system PATH.
    *   Sets up a post-build-hook and OIDC token refresher (systemd service).
2.  **Post Phase (`src/index.ts`):**
    *   Collects logs from the refresher service and hook script.
    *   Stops the refresher service.

#### Store-scan mode (`use-daemon: false`)
1.  **Main Phase (`src/stages/store-snapshot.ts`):**
    *   Captures a snapshot of all store paths under `/nix/store` before the build.
2.  **Post Phase (`src/stages/push-diff.ts`):**
    *   Computes the difference between the pre-build snapshot and the current store.
    *   Validates new paths with `nix path-info`.
    *   Pushes new paths in batches with OIDC token caching.

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
| `use-daemon` | Use post-build-hook with nix-daemon. Set to `false` for environments without systemd. | No | `true` |

### Example Workflow (Standard)

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: cachix/install-nix-action@v27
  - uses: ./ # or the published action name
    with:
      endpoint: "https://my-niks3-server.com"
      auth-token: "${{ secrets.NIKS3_TOKEN }}"
```

### Example Workflow (OIDC)

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: cachix/install-nix-action@v27
  - uses: ./ # or the published action name
    with:
      endpoint: "https://my-niks3-server.com"
      use-oidc: true

### Example Workflow (AWS Substituter)

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: cachix/install-nix-action@v27
    with:
      extra_nix_config: |
        extra-substituters = s3://nix-cache?endpoint=...
  - uses: ./ # or the published action name
    with:
      endpoint: "https://my-niks3-server.com"
      use-oidc: true
      aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
      aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

## Development

### Prerequisites

*   **Nix:** The project uses `flake.nix` to provide a consistent development environment.
*   **Node.js & pnpm:** Managed via the Nix flake.

### Setup

Enter the development shell:

```bash
nix develop
```

This will provide `nodejs`, `pnpm`, and `actionlint`.

### Building

The project uses `esbuild` to bundle the TypeScript code into a single entry point at `dist/index.js`.

```bash
pnpm install
pnpm run build
```

### Code Quality

The project uses **Biome** for linting and formatting.

```bash
pnpm run check  # Runs both format and lint
pnpm run format # Formats code
pnpm run lint   # Lints code
```

### Release Process

The project uses a GitHub Action to automatically build and tag releases.
1.  Draft a new release on GitHub.
2.  Publish the release.
3.  The `release.yml` workflow will:
    *   Check out the tag.
    *   Build the project (generate `dist/index.js`).
    *   Commit the built `dist/` folder back to the tag.

### Project Structure

*   `action.yml`: Defines the GitHub Action metadata (inputs, runs).
*   `src/index.ts`: The main entry point. Handles the logic to distinguish between the "main" run and the "post" run, and branches on `use-daemon`.
*   `src/aws.ts`: AWS credential configuration for Nix S3 substituters.
*   `src/store.ts`: Lists valid store paths under `/nix/store`.
*   `src/stages/install.ts`: Logic for installing `niks3` and setting up post-build-hook (daemon mode only).
*   `src/stages/store-snapshot.ts`: Captures pre-build store path snapshot (store-scan mode).
*   `src/stages/push-diff.ts`: Computes store diff and pushes new paths (store-scan mode).
*   `src/stages/push-inputs.ts`: Pushes flake inputs to the cache.
*   `src/stages/refresher.ts`: OIDC token refresh daemon (daemon mode).
*   `dist/index.js`: The compiled/bundled JavaScript file that GitHub Actions actually executes.

## Dependencies

*   `@actions/core`: For reading inputs, setting status, and logging.
*   `@actions/exec`: For executing shell commands (like `nix build`, `niks3 push`).
*   `esbuild`: Bundler for creating the distribution file.

## Key Commands

| Command | Description |
| :--- | :--- |
| `pnpm run build` | Compiles TypeScript to `dist/index.js`. |
| `nix develop` | Enters the Nix development shell. |
| `pnpm run check` | Runs Biome format and lint check. |