import { writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as core from "@actions/core";
import { exec } from "@actions/exec";
import * as io from "@actions/io";

export const configureAwsCredentials = async () => {
  const accessKeyId = core.getInput("aws-access-key-id");
  const secretAccessKey = core.getInput("aws-secret-access-key");

  if (!accessKeyId || !secretAccessKey) {
    core.debug("AWS credentials not provided, skipping configuration.");
    return;
  }

  core.startGroup("Configure AWS Credentials for Nix");

  try {
    const homeDir = os.homedir();
    const awsDir = path.join(homeDir, ".aws");
    const credentialsPath = path.join(awsDir, "credentials");

    await io.mkdirP(awsDir);

    const credentialsContent = `[default]
aws_access_key_id = ${accessKeyId}
aws_secret_access_key = ${secretAccessKey}
`;

    await writeFile(credentialsPath, credentialsContent, { mode: 0o600 });
    core.info(`Wrote AWS credentials to ${credentialsPath}`);

    // If running on Linux, try to configure for root (nix-daemon)
    if (process.platform === "linux") {
      try {
        // Check if we can sudo
        await exec("sudo", ["-n", "true"], { silent: true });

        core.info("Configuring credentials for root (nix-daemon)...");
        await exec("sudo", ["mkdir", "-p", "/root/.aws"]);
        await exec("sudo", ["cp", credentialsPath, "/root/.aws/credentials"]);

        // Ensure root owns the file
        await exec("sudo", ["chown", "root:root", "/root/.aws/credentials"]);
      } catch (error) {
        core.info(
          "Skipping root configuration (sudo not available or failed).",
        );
        core.debug(`${error}`);
      }
    }
  } catch (error) {
    core.warning(`Failed to configure AWS credentials: ${error}`);
  }

  core.endGroup();
};
