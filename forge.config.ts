import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, relative, sep } from "node:path";
import { createRequire } from "node:module";

const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, "package.json"), "utf8"),
) as { version: string };

const packageVersion = packageJson.version;
const appIconBase = resolve(__dirname, "assets/app-icon/icon");
const appIconIcns = resolve(__dirname, "assets/app-icon/icon.icns");
const appIconIco = resolve(__dirname, "assets/app-icon/icon.ico");
const appIconPng = resolve(__dirname, "assets/app-icon/icon-512.png");
const windowsSigningOptions =
  process.env.WINDOWS_CERTIFICATE_FILE &&
  process.env.WINDOWS_CERTIFICATE_PASSWORD
    ? {
        certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
        certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
      }
    : {};

// Vite normally excludes node_modules. ATEM requires its unbundled runtime tree.
const atemRuntimePaths = new Set<string>();
const collectRuntime = (name: string, from = __dirname) => {
  const runtimeRequire = createRequire(resolve(from, "package.json"));
  const manifest = runtimeRequire.resolve
    .paths(name)
    ?.map((base) => resolve(base, name, "package.json"))
    .find(existsSync);
  if (!manifest) throw new Error(`Missing ATEM runtime dependency: ${name}`);
  const directory = dirname(manifest);
  const packagePath = "/" + relative(__dirname, directory).split(sep).join("/");
  if (atemRuntimePaths.has(packagePath)) return;
  atemRuntimePaths.add(packagePath);
  const dependency = JSON.parse(readFileSync(manifest, "utf8"));
  for (const child of Object.keys(dependency.dependencies ?? {}))
    collectRuntime(child, directory);
};
collectRuntime("atem-connection");

const config: ForgeConfig = {
  packagerConfig: {
    overwrite: true,
    appBundleId: "com.agilize.ptzcontrols",
    asar: { unpack: "**/*.node" },
    ignore: (file) => {
      if (!file || file.startsWith("/.vite")) return false;
      return ![...atemRuntimePaths].some(
        (path) =>
          file === path ||
          file.startsWith(path + "/") ||
          path.startsWith(file + "/"),
      );
    },
    extraResource: [
      resolve(__dirname, "assets/app-icon"),
      resolve(__dirname, "assets/go2rtc"),
      resolve(__dirname, "LICENSE"),
    ],
    icon: appIconBase,
  },
  rebuildConfig: { ignoreModules: ["@julusian/freetype2"] },
  makers: [
    new MakerSquirrel({
      name: "AgilizePTZControls",
      setupExe: `Agilize-PTZ-Controls-Setup-${packageVersion}.exe`,
      setupIcon: appIconIco,
      ...windowsSigningOptions,
    }),
    new MakerDMG({
      icon: appIconIcns,
      overwrite: true,
    }),
    new MakerRpm({
      options: {
        icon: appIconPng,
      },
    }),
    new MakerDeb({
      options: {
        icon: appIconPng,
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
