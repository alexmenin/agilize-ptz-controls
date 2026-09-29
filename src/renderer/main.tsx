import { AtemBridge } from "./components/atem/atem-store";
import { ThumbnailProvider } from "./components/thumbnails/ThumbnailProvider";
import React from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "./components/ui/tooltip";
import { MobileControl } from "./views/MobileControl";
import { App } from "./App";
import "./styles.css";
import "./studio.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Panevo root element was not found.");
}

createRoot(root).render(
  <React.StrictMode>
    <AtemBridge />
    <ThumbnailProvider>
      {window.panevo ? (
        <App />
      ) : (
        <TooltipProvider>
          <MobileControl />
        </TooltipProvider>
      )}
    </ThumbnailProvider>
  </React.StrictMode>,
);
