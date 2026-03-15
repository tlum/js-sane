import path from "node:path";

const DEFAULT_ADDON_NAME = "js_sane.node";

export function resolveAddonPath(baseDir: string = __dirname): string {
  if (process.env.JS_SANE_ADDON_PATH) {
    return path.resolve(process.env.JS_SANE_ADDON_PATH);
  }

  return path.resolve(baseDir, "..", "build", "Release", DEFAULT_ADDON_NAME);
}

export function loadAddon<T>(baseDir?: string): T {
  const addonPath = resolveAddonPath(baseDir);
  return require(addonPath) as T;
}
