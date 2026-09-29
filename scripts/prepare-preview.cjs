const { mkdir, writeFile, chmod } = require("node:fs/promises");
const { createHash } = require("node:crypto");
const path = require("node:path");
(async () => {
  const platform = process.argv[2] || process.platform;
  if (!["win32", "linux"].includes(platform))
    throw new Error("Plataforma não suportada");
  const linux = platform === "linux";
  const response = await fetch(
    `https://github.com/AlexxIT/go2rtc/releases/download/v1.9.14/${linux ? "go2rtc_linux_amd64" : "go2rtc_win64.exe"}`,
  );
  if (!response.ok)
    throw new Error("Falha ao baixar go2rtc: " + response.status);
  const data = Buffer.from(await response.arrayBuffer());
  if (
    createHash("sha256").update(data).digest("hex") !==
    (linux
      ? "32d616af226bd731678ffde328b94cfb94e30339bfefc469cfb76323144615a6"
      : "923d57252e8139a69c52e4acc1e399a640244a8ef457fd9b7267a25847d68f8c")
  )
    throw new Error("Checksum inesperado; arquivo não salvo.");
  const folder = path.join(__dirname, "../assets/go2rtc");
  await mkdir(folder, { recursive: true });
  const target = path.join(folder, linux ? "go2rtc" : "go2rtc.exe");
  await writeFile(target, data);
  if (linux) await chmod(target, 0o755);
  console.log("go2rtc 1.9.14 pronto.");
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
