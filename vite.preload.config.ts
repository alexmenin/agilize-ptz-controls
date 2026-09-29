import { defineConfig, type Plugin } from "vite";

const disablePreloadCodeSplitting = (): Plugin => ({
  name: "panevo:disable-preload-code-splitting",
  configResolved(config) {
    const output = config.build.rolldownOptions.output;
    const outputs = Array.isArray(output) ? output : [output];

    for (const item of outputs) {
      if (!item) {
        continue;
      }

      const normalizedOutput = item as Record<string, unknown>;
      delete normalizedOutput.inlineDynamicImports;
      normalizedOutput.codeSplitting = false;
    }
  },
});

// https://vitejs.dev/config
export default defineConfig({
  plugins: [disablePreloadCodeSplitting()],
});
