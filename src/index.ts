import * as core from "@actions/core";
import { configureAwsCredentials } from "./aws";
import { install, isInstalled } from "./stages/install";
import { push } from "./stages/push";
import { runRefresher } from "./stages/refresher";
import { saveStorePaths } from "./utils";

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
  }
  // Post phase is now handled by the post-build-hook
};

main();
