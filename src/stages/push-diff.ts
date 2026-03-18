import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as core from "@actions/core";
import { exec } from "@actions/exec";
import { listStorePaths } from "../store";

const TEMP_DIR = process.env.RUNNER_TEMP || "/tmp";

/** Extract the exp claim from a JWT payload. */
const getJwtExp = (jwt: string): number => {
  const payload = JSON.parse(
    Buffer.from(jwt.split(".")[1], "base64url").toString(),
  );
  return typeof payload.exp === "number" ? payload.exp : 0;
};

const TOKEN_MARGIN_SECONDS = 30;
let cachedToken: { token: string; exp: number } | undefined;

/** Get an auth token. Reuses a cached OIDC token if it has sufficient remaining lifetime. */
const getToken = async (
  useOidc: boolean,
  audience: string,
  authToken: string,
): Promise<string> => {
  if (!useOidc) {
    return authToken;
  }

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - now > TOKEN_MARGIN_SECONDS) {
    return cachedToken.token;
  }

  const freshToken = await core.getIDToken(audience);
  cachedToken = { token: freshToken, exp: getJwtExp(freshToken) };
  return freshToken;
};

/** Push new store paths that were added since the pre-build snapshot. */
export const pushNewStorePaths = async () => {
  const snapshotPath = core.getState("preBuildSnapshotPath");
  if (!snapshotPath) {
    core.info("No pre-build snapshot found, skipping push");
    return;
  }

  core.startGroup("Push new store paths");
  let tokenFile: string | undefined;
  try {
    const prePaths = new Set(
      (await readFile(snapshotPath, "utf-8"))
        .trim()
        .split("\n")
        .filter(Boolean),
    );
    const currentPaths = await listStorePaths();
    const allNewPaths = currentPaths.filter((p) => !prePaths.has(p));
    core.info(`Found ${allNewPaths.length} new store paths, validating...`);

    // Validate paths exist in the store via nix path-info
    const validPaths: string[] = [];
    for (const p of allNewPaths) {
      try {
        await exec("nix", ["path-info", p], { silent: true });
        validPaths.push(p);
      } catch {
        core.debug(`Skipping invalid path: ${p}`);
      }
    }

    const skippedCount = allNewPaths.length - validPaths.length;
    if (skippedCount > 0) {
      core.info(`Skipped ${skippedCount} invalid paths`);
    }

    if (validPaths.length === 0) {
      core.info("No new valid store paths to push");
      return;
    }

    core.info(`Pushing ${validPaths.length} new store paths`);

    // Authentication setup
    const endpoint = core.getInput("endpoint");
    const useOidc = core.getBooleanInput("use-oidc");
    const authToken = core.getInput("auth-token");
    const audience = core.getInput("oidc-audience") || endpoint;
    const maxConcurrentUploads = core.getInput("max-concurrent-uploads");

    if (!useOidc && !authToken) {
      core.warning("No authentication provided, skipping push");
      return;
    }

    const batchSize = Number.parseInt(maxConcurrentUploads, 10) || 30;
    const batches = Array.from(
      { length: Math.ceil(validPaths.length / batchSize) },
      (_, i) => validPaths.slice(i * batchSize, (i + 1) * batchSize),
    );

    let pushed = 0;
    let failureCount = 0;
    for (const batch of batches) {
      const start = pushed + 1;
      const end = pushed + batch.length;
      try {
        core.info(`Pushing ${start}-${end}/${validPaths.length}`);

        const token = await getToken(useOidc, audience, authToken);
        tokenFile = join(TEMP_DIR, "niks3-push-diff-token");
        await writeFile(tokenFile, token, { mode: 0o600 });

        await exec(
          "niks3",
          [
            "push",
            "--server-url",
            endpoint,
            "--max-concurrent-uploads",
            maxConcurrentUploads,
            ...batch,
          ],
          {
            env: {
              ...process.env,
              NIKS3_AUTH_TOKEN_FILE: tokenFile,
            },
          },
        );
      } catch (error) {
        failureCount += batch.length;
        core.warning(`Failed to push batch ${start}-${end}: ${error}`);
      }
      pushed = end;
    }

    if (failureCount > 0) {
      core.warning(`${failureCount}/${validPaths.length} paths failed to push`);
    } else {
      core.info("Push completed successfully");
    }
  } catch (error) {
    core.warning(`Push failed: ${error}`);
  } finally {
    // Cleanup
    await rm(join(snapshotPath, ".."), { recursive: true, force: true }).catch(
      (error) => {
        core.debug(`Failed to cleanup snapshot: ${error}`);
      },
    );
    if (tokenFile) {
      await rm(tokenFile, { force: true }).catch((error) => {
        core.debug(`Failed to cleanup token file: ${error}`);
      });
    }
  }
  core.endGroup();
};
