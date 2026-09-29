import type { PanevoApi } from "../../shared/types";

declare global {
  interface Window {
    panevo: PanevoApi;
  }
}

export {};
