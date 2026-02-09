import * as core from "@actions/core";
import { exec } from "@actions/exec";
import { configureAwsCredentials } from "./aws";
import { install, isInstalled } from "./stages/install";
import { runRefresher } from "./stages/refresher";

const isPost = !!core.getState("isPost");
const isRefresher = process.env.NIKS3_MODE === "refresher";

const main = async () => {
  if (isRefresher) {
    await runRefresher();
    return;
  }

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
    } catch (error) {
      core.setFailed(`Action failed: ${error}`);
    }
  } else {
    // Post phase
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
        core.warning(`Failed to get refresher logs or stop service: ${error}`);
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
  }
};

main();
