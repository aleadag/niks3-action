import * as core from "@actions/core";
import { exec } from "@actions/exec";
import { getStorePaths, saveStorePaths } from "../utils";

export const push = async () => {
  core.startGroup("Push to niks3 Cache");
  try {
    const skipPush = core.getInput("skip-push");
    if (skipPush === "true") {
      core.info("Pushing to cache is disabled by skip-push");
      return;
    }

    const endpoint = core.getInput("endpoint");
    let authToken = core.getInput("auth-token");
    const useOidc = core.getBooleanInput("use-oidc");
    const audience = core.getInput("oidc-audience") || endpoint;
    const maxConcurrentUploads = core.getInput("max-concurrent-uploads");

    // Helper to get or refresh token
    let tokenLastFetched = 0;
    const getAuthToken = async () => {
      if (useOidc) {
        // Refresh if older than 4 minutes (GitHub tokens expire in ~5 mins)
        if (Date.now() - tokenLastFetched > 4 * 60 * 1000) {
          core.debug("Refreshing OIDC token...");
          authToken = await core.getIDToken(audience);
          tokenLastFetched = Date.now();
        }
      }
      return authToken;
    };

    // Initial check
    if (!(await getAuthToken())) {
      throw new Error(
        "No authentication token provided. Set 'auth-token' or 'use-oidc'.",
      );
    }

    // This is a bit redundant if we assume niks3 doesn't need "login" state,
    // but acts on command line args.

    core.info("Calculating paths to push...");
    const oldPaths = await getStorePaths();
    await saveStorePaths(); // Get current state
    const newPaths = await getStorePaths();

    // Calculate diff
    const pushPaths = newPaths
      .filter((p) => !oldPaths.includes(p))
      .filter(
        (p) =>
          !p.endsWith(".drv") &&
          !p.endsWith(".drv.chroot") &&
          !p.endsWith(".check") &&
          !p.endsWith(".lock"),
      );

    if (pushPaths.length === 0) {
      core.info("No new paths to push.");
    } else {
      core.info(`Pushing ${pushPaths.length} new paths...`);

      // Batching to prevent command line length issues and handle token expiry
      // Ensure batch size is at least enough to saturate the concurrent uploads
      const concurrency = Number.parseInt(maxConcurrentUploads || "30", 10);
      const BATCH_SIZE = Math.max(50, concurrency * 2);

      for (let i = 0; i < pushPaths.length; i += BATCH_SIZE) {
        const batch = pushPaths.slice(i, i + BATCH_SIZE);
        const currentToken = await getAuthToken();

        core.info(
          `Pushing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(pushPaths.length / BATCH_SIZE)} (${batch.length} paths)...`,
        );

        const args = [
          "push",
          "--server-url",
          endpoint,
          "--auth-token",
          currentToken || "",
        ];

        if (maxConcurrentUploads) {
          args.push("--max-concurrent-uploads", maxConcurrentUploads);
        }

        args.push(...batch);

        await exec("niks3", args);
      }
    }
  } catch (error) {
    core.warning(`Error during push: ${error}`);
    // We don't fail the build if caching fails
  }
  core.endGroup();
};
