import { writeFile } from "node:fs/promises";
import * as path from "node:path";
import * as core from "@actions/core";
import { exec } from "@actions/exec";

export const isInstalled = async (): Promise<boolean> => {
  try {
    await exec("which", ["niks3"], { silent: true });
    return true;
  } catch {
    return false;
  }
};

export const install = async () => {
  core.startGroup("Install niks3");
  try {
    // Build niks3 from the provided source or default
    await exec("nix", ["build", "-o", "niks3", "github:Mic92/niks3"]);

    const cwd = process.cwd();
    const niks3Path = `${cwd}/niks3/bin`;
    core.addPath(niks3Path);

    core.info("niks3 installed and added to PATH");

    const useOidc = core.getBooleanInput("use-oidc");
    const authToken = core.getInput("auth-token");

    // --- Setup Refresher & Hook ---
    if (useOidc || authToken) {
      core.info("Setting up post-build hook...");

      const endpoint = core.getInput("endpoint");
      const tmpDir = process.env.RUNNER_TEMP || "/tmp";
      const tokenFile = path.join(tmpDir, "niks3-token");
      const hookScriptPath = path.join(tmpDir, "niks3-hook.sh");

      if (useOidc) {
        core.info("Setting up OIDC token refresher...");
        const audience = core.getInput("oidc-audience") || endpoint;

        // We need absolute path to the node executable and the script
        const nodePath = process.execPath;
        const scriptPath = __filename;

        // 1. Create Systemd Service for Refresher
        if (process.platform === "linux") {
          const serviceContent = `[Unit]
Description=Niks3 Token Refresher
After=network.target

[Service]
ExecStart=${nodePath} ${scriptPath}
Environment="NIKS3_MODE=refresher"
Environment="NIKS3_TOKEN_FILE=${tokenFile}"
Environment="NIKS3_OIDC_AUDIENCE=${audience}"
# Pass through necessary GitHub Actions env vars for OIDC
Environment="ACTIONS_ID_TOKEN_REQUEST_TOKEN=${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || ""}"
Environment="ACTIONS_ID_TOKEN_REQUEST_URL=${process.env.ACTIONS_ID_TOKEN_REQUEST_URL || ""}"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
          const servicePath = path.join(tmpDir, "niks3-refresher.service");
          await writeFile(servicePath, serviceContent);

          core.info("Installing refresher systemd service...");
          await exec("sudo", [
            "mv",
            servicePath,
            "/etc/systemd/system/niks3-refresher.service",
          ]);
          await exec("sudo", ["systemctl", "daemon-reload"]);
          await exec("sudo", ["systemctl", "start", "niks3-refresher"]);

          // Verify it started
          await exec("sudo", ["systemctl", "status", "niks3-refresher"], {
            ignoreReturnCode: true,
          });
        } else {
          core.warning(
            "OIDC refresher daemon only supported on Linux (systemd). Uploads may fail if token expires.",
          );
        }
      } else if (authToken) {
        // Write static token
        await writeFile(tokenFile, authToken, { mode: 0o644 });
        core.info("Wrote static auth token to token file.");
      }

      // 2. Create Hook Script
      // Note: $OUT_PATHS is a space-separated list of paths passed by Nix
      const hookLogFile = path.join(tmpDir, "niks3-hook.log");
      const hookScript = `#!/bin/bash
set -e
exec >> "${hookLogFile}" 2>&1
export PATH="/nix/var/nix/profiles/default/bin:$PATH"
export NIKS3_AUTH_TOKEN_FILE="${tokenFile}"
echo "--- $(date) ---"
echo "Uploading: $OUT_PATHS"
${niks3Path}/niks3 push --server-url "${endpoint}" --max-concurrent-uploads ${core.getInput("max-concurrent-uploads")} $OUT_PATHS
`;
      await writeFile(hookScriptPath, hookScript, { mode: 0o755 });
      core.info(`Hook script created at ${hookScriptPath}`);

      // 3. Configure Nix
      // We need to append to nix.conf.
      // On GitHub Actions (Ubuntu), nix.conf is usually at /etc/nix/nix.conf
      // and we need sudo to edit it.
      if (process.platform === "linux") {
        try {
          await exec(
            "sudo",
            [
              "bash",
              "-c",
              `echo "post-build-hook = ${hookScriptPath}" >> /etc/nix/nix.conf`,
            ],
            { silent: true },
          );
          // Restart nix-daemon to pick up config changes if necessary
          // Note: older nix versions might need restart, newer ones might pick up per-command config?
          // Actually, post-build-hook is a config option.
          // Restarting daemon is safer.
          await exec("sudo", ["systemctl", "restart", "nix-daemon"]);
          core.info("Configured post-build-hook in /etc/nix/nix.conf");
        } catch (error) {
          core.warning(
            `Failed to configure post-build-hook system-wide: ${error}`,
          );
        }
      } else {
        core.warning(
          "Skipping system-wide post-build-hook configuration (not on Linux)",
        );
      }
    }
  } catch (error) {
    core.setFailed(`Failed to install niks3: ${error}`);
  }
  core.endGroup();
};
