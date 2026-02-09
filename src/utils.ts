import { readFile } from "node:fs/promises";
import * as core from "@actions/core";
import { exec } from "@actions/exec";

export const saveStorePaths = async () => {
  // We use a temporary file to store the list of paths
  const tmpDir = process.env.RUNNER_TEMP || "/tmp";
  await exec("sh", [
    "-c",
    `nix path-info --all --json > ${tmpDir}/niks3-action-store-paths`,
  ]);
};

export const getStorePaths = async () => {
  const tmpDir = process.env.RUNNER_TEMP || "/tmp";
  try {
    const content = await readFile(
      `${tmpDir}/niks3-action-store-paths`,
      "utf8",
    );
    const rawStorePaths = JSON.parse(content) as
      | { path: string }[]
      | { [key: string]: unknown };

    // Handle both array (newer Nix) and object (older Nix) formats
    if (Array.isArray(rawStorePaths)) {
      return rawStorePaths.map((path) => path.path);
    }
    return Object.keys(rawStorePaths);
  } catch (error) {
    core.warning(`Failed to read store paths: ${error}`);
    return [];
  }
};
