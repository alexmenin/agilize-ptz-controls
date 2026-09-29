import { app, BrowserWindow, dialog } from "electron";
import path from "node:path";
import { readFileSync } from "node:fs";
import { appIconPath } from "./asset-paths";
import { platformConfig } from "./platform";

let mainWindow: BrowserWindow | null = null;

export const getMainWindow = () => mainWindow;

export const createMainWindow = () => {
  const splash = new BrowserWindow({
    width: 520,
    height: 300,
    frame: false,
    resizable: false,
    center: true,
    backgroundColor: "#0b121a",
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const logo = readFileSync(
    path.join(path.dirname(appIconPath), "brand-white.png"),
  ).toString("base64");
  void splash.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(
        `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>body{margin:0;height:100vh;display:grid;place-content:center;background:radial-gradient(ellipse at top right,#163e3a,#0b121a 70%);color:#eef5f8;font-family:Arial;text-align:center}h1{letter-spacing:5px;font-size:34px;margin:0 0 12px}small{letter-spacing:4px;color:#70dfc8}p{font-size:13px;color:#adbdc9;margin-top:42px}.bar{height:3px;width:230px;background:#263a46;margin:auto;overflow:hidden;border-radius:3px}.bar:after{content:'';display:block;width:40%;height:100%;background:#70dfc8;animation:load 1.4s infinite ease-in-out}@keyframes load{from{transform:translateX(-100%)}to{transform:translateX(360%)}}</style><img alt="Agilize Soluções Digitais" style="width:300px;height:130px;object-fit:contain;margin:auto" src="data:image/png;base64,${logo}"><small>PTZ CONTROLS</small><p>Abrindo sua mesa de operação…</p><div class="bar"></div></html>`,
      ),
  );
  mainWindow = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    minWidth: 720,
    autoHideMenuBar: true,
    minHeight: 560,
    backgroundColor: "#090d12",
    title: "Agilize PTZ Controls",
    icon: platformConfig.windowIconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const window = mainWindow;
  const reveal = () => {
    if (!splash.isDestroyed()) splash.destroy();
    if (!window.isDestroyed()) window.show();
  };
  window.once("ready-to-show", reveal);
  window.webContents.on(
    "did-fail-load",
    (_event, code, description, _url, mainFrame) => {
      if (!mainFrame || code === -3) return;
      reveal();
      void dialog
        .showMessageBox(window, {
          type: "error",
          title: "Agilize PTZ Controls",
          message: "Não foi possível abrir a interface.",
          detail: description,
          buttons: ["Tentar novamente", "Fechar"],
        })
        .then(({ response }) => {
          if (!window.isDestroyed()) {
            if (response === 0) window.reload();
            else app.quit();
          }
        });
    },
  );
  window.once("closed", () => {
    if (!splash.isDestroyed()) splash.destroy();
  });
  mainWindow.setMenuBarVisibility(false);
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
};
