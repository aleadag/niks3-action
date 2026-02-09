import { spawn } from "node:child_process";
import { open, writeFile } from "node:fs/promises";
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

    // --- Setup Refresher & Hook ---
    if (core.getBooleanInput("use-oidc")) {
      core.info("Setting up OIDC token refresher and post-build hook...");

      const endpoint = core.getInput("endpoint");
      const audience = core.getInput("oidc-audience") || endpoint;
      const tmpDir = process.env.RUNNER_TEMP || "/tmp";
      const tokenFile = path.join(tmpDir, "niks3-token");
      const hookScriptPath = path.join(tmpDir, "niks3-hook.sh");
      const logFile = path.join(tmpDir, "niks3-refresher.log");

      // 1. Start Refresher
      const out = await open(logFile, "a");
      const err = await open(logFile, "a");

      const refresher = spawn(process.execPath, [__filename], {
        env: {
          ...process.env,
          NIKS3_MODE: "refresher",
          NIKS3_TOKEN_FILE: tokenFile,
          NIKS3_OIDC_AUDIENCE: audience,
        },
        detached: true,
        stdio: ["ignore", out.fd, err.fd],
      });
      refresher.unref();
      core.info(`Refresher started (PID: ${refresher.pid})`);

      // 2. Create Hook Script
      // Note: $OUT_PATHS is a space-separated list of paths passed by Nix
      const hookScript = `#!/bin/bash
set -e
export NIKS3_AUTH_TOKEN_FILE="${tokenFile}"
echo "Uploading paths to niks3..."
echo $OUT_PATHS | xargs -n 1 | ${niks3Path}/niks3 push --server-url "${endpoint}" --max-concurrent-uploads ${core.getInput("max-concurrent-uploads")}
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
