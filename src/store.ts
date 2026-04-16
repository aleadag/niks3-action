import { readdir } from "node:fs/promises";
import { join } from "node:path";

const NIX_STORE = "/nix/store";

/** Valid Nix store path format: <32-char nix base32 hash>-<name> (excluding .drv, .drv.chroot, .check, .lock) */
const STORE_PATH_RE =
  /^[0-9a-df-np-sv-z]{32}-.+(?<!\.drv)(?<!\.drv\.chroot)(?<!\.check)(?<!\.lock)$/;

/** List only valid store paths under /nix/store. */
export const listStorePaths = async (): Promise<string[]> => {
  const entries = await readdir(NIX_STORE);
  return entries
    .filter((e) => STORE_PATH_RE.test(e))
    .map((e) => join(NIX_STORE, e));
};
