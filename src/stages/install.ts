import * as core from "@actions/core";
import { exec } from "@actions/exec";

export const isInstalled = async (): Promise<boolean> => {
	try {
		await exec("which", ["niks3"], { silent: true });
		return true;
	} catch {
		return false;
	}
};

export const install = async () => {
	core.startGroup("Install niks3");
	try {
		// Build niks3 from the provided source or default
		// The original workflow used: nix build -o niks3 github:Mic92/niks3
		await exec("nix", ["build", "-o", "niks3", "github:Mic92/niks3"]);

		// Add to PATH
		const cwd = process.cwd();
		core.addPath(`${cwd}/niks3/bin`);

		core.info("niks3 installed and added to PATH");
	} catch (error) {
		core.setFailed(`Failed to install niks3: ${error}`);
	}
	core.endGroup();
};
