const { mkdir, writeFile } = require("node:fs/promises");
const { createHash } = require("node:crypto");
const path = require("node:path");
(async () => {
  const response = await fetch(
    "https://github.com/AlexxIT/go2rtc/releases/download/v1.9.14/go2rtc_win64.exe",
  );
  if (!response.ok)
    throw new Error("Falha ao baixar go2rtc: " + response.status);
  const data = Buffer.from(await response.arrayBuffer());
  if (
    createHash("sha256").update(data).digest("hex") !==
    "923d57252e8139a69c52e4acc1e399a640244a8ef457fd9b7267a25847d68f8c"
  )
    throw new Error("Checksum inesperado; arquivo não salvo.");
  const folder = path.join(__dirname, "../assets/go2rtc");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "go2rtc.exe"), data);
  console.log("go2rtc 1.9.14 pronto.");
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
