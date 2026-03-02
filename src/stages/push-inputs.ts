import * as core from "@actions/core";
import { exec } from "@actions/exec";
import * as path from "node:path";
import { writeFile } from "node:fs/promises";

export const pushFlakeInputs = async () => {
  if (!core.getBooleanInput("push-flake-inputs")) {
    return;
  }

  core.startGroup("Push Flake Inputs to Niks3");
  try {
    const endpoint = core.getInput("endpoint");
    const useOidc = core.getBooleanInput("use-oidc");
    const authToken = core.getInput("auth-token");
    const maxConcurrentUploads = core.getInput("max-concurrent-uploads");

    if (!endpoint) {
      throw new Error("Missing niks3 endpoint");
    }

    // Set up authentication for niks3 push
    const tmpDir = process.env.RUNNER_TEMP || "/tmp";
    const tokenFile = path.join(tmpDir, "niks3-push-token");

    if (useOidc) {
      const audience = core.getInput("oidc-audience") || endpoint;
      core.info("Fetching OIDC token...");
      const token = await core.getIDToken(audience);
      await writeFile(tokenFile, token, { mode: 0o644 });
      process.env.NIKS3_AUTH_TOKEN_FILE = tokenFile;
    } else if (authToken) {
      await writeFile(tokenFile, authToken, { mode: 0o644 });
      process.env.NIKS3_AUTH_TOKEN_FILE = tokenFile;
    } else {
      core.warning("No authentication provided for pushing flake inputs.");
    }

    core.info("Getting flake inputs...");
    let archiveJson = "";
    await exec("nix", ["flake", "archive", "--json"], {
      listeners: {
        stdout: (data: Buffer) => {
          archiveJson += data.toString();
        },
      },
      silent: true,
    });

    const archive = JSON.parse(archiveJson);
    const paths: string[] = [];

    if (archive.path) {
      paths.push(archive.path);
    }

    if (archive.inputs) {
      for (const input of Object.values(archive.inputs)) {
        if ((input as any).path) {
          paths.push((input as any).path);
        }
      }
    }

    if (paths.length === 0) {
      core.info("No flake inputs found to push.");
      return;
    }

    core.info(`Pushing ${paths.length} paths to ${endpoint}...`);
    
    // niks3 push can take multiple paths
    await exec("niks3", [
      "push",
      "--server-url",
      endpoint,
      "--max-concurrent-uploads",
      maxConcurrentUploads,
      ...paths,
    ]);

    core.info("Successfully pushed flake inputs.");
  } catch (error) {
    core.warning(`Failed to push flake inputs: ${error}`);
  }
  core.endGroup();
};
