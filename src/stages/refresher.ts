import { writeFile } from "node:fs/promises";
import * as core from "@actions/core";

export const runRefresher = async () => {
  const tokenFile = process.env.NIKS3_TOKEN_FILE;
  const audience = process.env.NIKS3_OIDC_AUDIENCE;

  if (!tokenFile || !audience) {
    throw new Error("Missing required environment variables for refresher");
  }

  const refresh = async () => {
    try {
      core.debug("Refreshing OIDC token...");
      const token = await core.getIDToken(audience);
      await writeFile(tokenFile, token, { mode: 0o644 });
      core.info(`Token refreshed and written to ${tokenFile}`);
    } catch (error) {
      core.warning(`Failed to refresh token: ${error}`);
    }
  };

  // Initial refresh
  await refresh();

  // Loop every 1 minute (60000 ms)
  setInterval(refresh, 60000);

  // Keep process alive
  await new Promise(() => {});
};
