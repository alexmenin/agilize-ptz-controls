// Run after: npm run package -- --platform=linux --arch=x64
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const version = require("../package.json").version;
const source = path.join(root, "out/Agilize PTZ Controls-linux-x64");
const stage = path.join(root, "out/deb-root");
const dest = path.join(stage, "opt/agilize-ptz-controls");
if (process.platform !== "linux" || process.arch !== "x64")
  throw new Error("Build requires Linux x64");
if (!fs.existsSync(path.join(source, "resources/go2rtc/go2rtc")))
  throw new Error("Linux preview binary missing");
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(source, dest, { recursive: true });
fs.renameSync(
  path.join(dest, "Agilize PTZ Controls"),
  path.join(dest, "agilize-ptz-controls"),
);
fs.chmodSync(path.join(dest, "chrome-sandbox"), 0o4755);
const put = (name, body, mode = 0o644) => {
  const file = path.join(stage, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, { mode });
};
put(
  "usr/bin/agilize-ptz-controls",
  '#!/bin/sh\nexec /opt/agilize-ptz-controls/agilize-ptz-controls "$@"\n',
  0o755,
);
put(
  "usr/share/applications/agilize-ptz-controls.desktop",
  `[Desktop Entry]
Type=Application
Name=Agilize PTZ Controls
Comment=Controle de câmeras PTZ, presets e transmissão ATEM
Exec=agilize-ptz-controls %U
Icon=agilize-ptz-controls
Terminal=false
Categories=AudioVideo;Video;
StartupWMClass=agilize-ptz-controls
`,
);
put(
  "usr/share/icons/hicolor/512x512/apps/agilize-ptz-controls.png",
  fs.readFileSync(path.join(root, "assets/app-icon/icon-512.png")),
);
put(
  "usr/share/agilize-ptz-controls/apparmor-profile",
  `abi <abi/4.0>,
include <tunables/global>
profile agilize-ptz-controls /opt/agilize-ptz-controls/agilize-ptz-controls flags=(unconfined) {
  userns,
  include if exists <local/agilize-ptz-controls>
}
`,
);
put(
  "DEBIAN/postinst",
  `#!/bin/sh
set -e
if [ "$1" = configure ]; then
  if [ -f /etc/apparmor.d/abi/4.0 ] && command -v apparmor_parser >/dev/null 2>&1; then
    install -m 644 /usr/share/agilize-ptz-controls/apparmor-profile /etc/apparmor.d/agilize-ptz-controls
    if [ -d /sys/kernel/security/apparmor ]; then
      apparmor_parser -r /etc/apparmor.d/agilize-ptz-controls
    fi
  fi
  if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database -q || true; fi
  if command -v gtk-update-icon-cache >/dev/null 2>&1; then gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true; fi
fi
`,
  0o755,
);
put(
  "DEBIAN/postrm",
  `#!/bin/sh
set -e
case "$1" in remove|purge)
  if [ -f /etc/apparmor.d/agilize-ptz-controls ]; then
    if command -v apparmor_parser >/dev/null 2>&1 && [ -d /sys/kernel/security/apparmor ]; then
      apparmor_parser -R /etc/apparmor.d/agilize-ptz-controls || true
    fi
    rm -f /etc/apparmor.d/agilize-ptz-controls
  fi
  if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database -q || true; fi
esac
`,
  0o755,
);
const size = execFileSync("du", ["-sk", stage], { encoding: "utf8" }).split(
  /\s/,
)[0];
put(
  "DEBIAN/control",
  `Package: agilize-ptz-controls
Version: ${version}
Architecture: amd64
Maintainer: Agilize Soluções Digitais
Section: video
Priority: optional
Installed-Size: ${size}
Homepage: https://agilizesolucoesdigitais.com.br
Depends: libc6 (>= 2.35), libgtk-3-0 | libgtk-3-0t64, libnss3, libnspr4, libasound2 | libasound2t64, libatk1.0-0 | libatk1.0-0t64, libatk-bridge2.0-0 | libatk-bridge2.0-0t64, libatspi2.0-0 | libatspi2.0-0t64, libdrm2, libgbm1, libx11-6, libxcb1, libxcomposite1, libxdamage1, libxext6, libxfixes3, libxrandr2, libxkbcommon0, libpango-1.0-0, libcairo2, libcups2 | libcups2t64, libdbus-1-3, libexpat1, libglib2.0-0 | libglib2.0-0t64
Description: Agilize PTZ Controls
 Controle PTZ VISCA, multiview RTSP, presets e integração ATEM.
`,
);
const output = path.join(
  root,
  `dist/agilize-ptz-controls_${version}_amd64.deb`,
);
fs.mkdirSync(path.dirname(output), { recursive: true });
execFileSync(
  "dpkg-deb",
  ["--root-owner-group", "-Zxz", "-z6", "--build", stage, output],
  { stdio: "inherit" },
);
console.log(output);
