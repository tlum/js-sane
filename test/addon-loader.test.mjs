import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { resolveAddonPath } from "../dist/addon-loader.js";

test("resolveAddonPath uses the default build output location", () => {
  const baseDir = "/tmp/js-sane/dist";
  const expected = path.resolve(baseDir, "..", "build", "Release", "js_sane.node");
  assert.equal(resolveAddonPath(baseDir), expected);
});

test("resolveAddonPath honors JS_SANE_ADDON_PATH", () => {
  const original = process.env.JS_SANE_ADDON_PATH;
  process.env.JS_SANE_ADDON_PATH = "./custom/addon.node";

  try {
    assert.equal(
      resolveAddonPath("/tmp/js-sane/dist"),
      path.resolve("./custom/addon.node")
    );
  } finally {
    if (original === undefined) {
      delete process.env.JS_SANE_ADDON_PATH;
    } else {
      process.env.JS_SANE_ADDON_PATH = original;
    }
  }
});
