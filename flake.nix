{
  description = "A Nix-flake-based Node.js development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable"; # unstable Nixpkgs

  outputs =
    { self, ... }@inputs:

    let
      nodeVersion = builtins.replaceStrings [ "\n" ] [ "" ] (builtins.readFile ./.node-version);
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forEachSupportedSystem =
        f:
        inputs.nixpkgs.lib.genAttrs supportedSystems (
          system:
          f {
            pkgs = import inputs.nixpkgs {
              inherit system;
              overlays = [ inputs.self.overlays.default ];
            };
          }
        );
    in
    {
      overlays.default = final: prev: {
        nodejs = prev."nodejs_${nodeVersion}";
      };

      devShells = forEachSupportedSystem (
        { pkgs }:
        {
          default = pkgs.mkShellNoCC {
            packages = with pkgs; [
              actionlint
              nodejs
              nodePackages.pnpm
            ];
          };
        }
      );

      formatter = forEachSupportedSystem (p: p.nixfmt);
    };
}
