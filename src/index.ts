import * as core from "@actions/core";
import { configureAwsCredentials } from "./aws";
import { install, isInstalled } from "./stages/install";
import { push } from "./stages/push";
import { saveStorePaths } from "./utils";

const isPost = !!core.getState("isPost");

const main = async () => {
  if (!isPost) {
    // Main phase
    try {
      core.saveState("isPost", "true");

      // Configure AWS credentials for Nix substituters (if provided)
      await configureAwsCredentials();

      // Capture initial store state before installation
      // This ensures that if we install niks3, it gets included in the diff and cached
      await saveStorePaths();

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
    await push();
  }
};

main();
