import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as core from "@actions/core";
import { listStorePaths } from "../store";

const TEMP_DIR = process.env.RUNNER_TEMP || "/tmp";

/** Save a snapshot of nix store paths before the build. */
export const capturePreBuildSnapshot = async () => {
  core.startGroup("Capture pre-build store snapshot");
  try {
    const snapshotDir = await mkdtemp(join(TEMP_DIR, "niks3-snapshot-"));
    const snapshotPath = join(snapshotDir, "pre-build-paths.txt");
    const paths = await listStorePaths();
    await writeFile(snapshotPath, `${paths.join("\n")}\n`);
    core.saveState("preBuildSnapshotPath", snapshotPath);
    core.info(
      `Saved pre-build store snapshot (${paths.length} paths) to ${snapshotPath}`,
    );
  } catch (error) {
    core.warning(`Failed to capture pre-build snapshot: ${error}`);
  }
  core.endGroup();
};
