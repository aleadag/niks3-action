import * as core from "@actions/core";
import { exec } from "@actions/exec";
import { configureAwsCredentials } from "./aws";
import { install, isInstalled } from "./stages/install";
import { pushNewStorePaths } from "./stages/push-diff";
import { pushFlakeInputs } from "./stages/push-inputs";
import { runRefresher } from "./stages/refresher";
import { capturePreBuildSnapshot } from "./stages/store-snapshot";

const isPost = !!core.getState("isPost");
const isRefresher = process.env.NIKS3_MODE === "refresher";

const main = async () => {
  if (isRefresher) {
    await runRefresher();
    return;
  }

  const useDaemon = core.getBooleanInput("use-daemon");
  const skipPush = core.getBooleanInput("skip-push");

  if (!isPost) {
    // Main phase
    try {
      core.saveState("isPost", "true");

      // Configure AWS credentials for Nix substituters (if provided)
      await configureAwsCredentials();

      if (await isInstalled()) {
        core.info("niks3 is already installed");
      } else {
        await install();
      }

      if (!useDaemon && !skipPush) {
        // Store-scan mode: capture pre-build snapshot
        await capturePreBuildSnapshot();
      }

      await pushFlakeInputs();
    } catch (error) {
      core.setFailed(`Action failed: ${error}`);
    }
  } else {
    // Post phase
    if (useDaemon) {
      if (core.getBooleanInput("use-oidc") && process.platform === "linux") {
        const tmpDir = process.env.RUNNER_TEMP || "/tmp";
        const hookLogFile = `${tmpDir}/niks3-hook.log`;

        core.startGroup("Niks3 Refresher Logs");
        try {
          await exec("sudo", [
            "journalctl",
            "-u",
            "niks3-refresher",
            "--no-pager",
          ]);
          await exec("sudo", ["systemctl", "stop", "niks3-refresher"]);
        } catch (error) {
          core.warning(
            `Failed to get refresher logs or stop service: ${error}`,
          );
        }
        core.endGroup();

        core.startGroup("Niks3 Hook Logs");
        try {
          await exec("cat", [hookLogFile], { ignoreReturnCode: true });
        } catch (error) {
          core.debug(`Failed to read hook logs: ${error}`);
        }
        core.endGroup();
      }
    } else if (!skipPush) {
      try {
        await pushNewStorePaths();
      } catch (error) {
        core.warning(`Store-scan push failed: ${error}`);
      }
    }
  }
};

main();
