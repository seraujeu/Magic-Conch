import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const PDFJS_ASSETS = [
  { publicPath: "pdfjs/pdf.worker.min.mjs", packagePath: "build/pdf.worker.min.mjs" },
  { publicPath: "pdfjs-wasm/jbig2.wasm", packagePath: "wasm/jbig2.wasm" },
  { publicPath: "pdfjs-wasm/jbig2_nowasm_fallback.js", packagePath: "wasm/jbig2_nowasm_fallback.js" },
  { publicPath: "pdfjs-wasm/openjpeg.wasm", packagePath: "wasm/openjpeg.wasm" },
  { publicPath: "pdfjs-wasm/openjpeg_nowasm_fallback.js", packagePath: "wasm/openjpeg_nowasm_fallback.js" },
  { publicPath: "pdfjs-wasm/qcms_bg.wasm", packagePath: "wasm/qcms_bg.wasm" },
] as const;

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
};

export function pdfJsAssets(): Plugin {
  let projectRoot = process.cwd();
  const assetPath = (packagePath: string) => resolve(
    projectRoot,
    "node_modules",
    "pdfjs-dist",
    ...packagePath.split("/"),
  );

  return {
    name: "magic-conch-pdfjs-assets",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    configResolved(config) {
      projectRoot = config.root;
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = request.url?.split("?", 1)[0];
        const asset = PDFJS_ASSETS.find((candidate) => `/${candidate.publicPath}` === pathname);
        if (!asset) return next();
        try {
          response.statusCode = 200;
          const extension = asset.publicPath.slice(asset.publicPath.lastIndexOf("."));
          response.setHeader("Content-Type", CONTENT_TYPES[extension] || "application/octet-stream");
          response.end(await readFile(assetPath(asset.packagePath)));
        } catch (error) {
          next(error as Error);
        }
      });
    },
    async generateBundle() {
      await Promise.all(PDFJS_ASSETS.map(async (asset) => {
        this.emitFile({
          type: "asset",
          fileName: asset.publicPath,
          source: await readFile(assetPath(asset.packagePath)),
        });
      }));
    },
  };
}
