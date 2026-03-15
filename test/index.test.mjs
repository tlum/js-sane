import test from "node:test";
import assert from "node:assert/strict";

import { createApi, SaneDeviceConnection } from "../dist/index.js";

test("createApi forwards session and discovery calls to the native addon", () => {
  const calls = [];
  const native = {
    init() {
      calls.push(["init"]);
      return { code: 1, major: 1, minor: 0, build: 0 };
    },
    exit() {
      calls.push(["exit"]);
    },
    getVersion() {
      calls.push(["getVersion"]);
      return { code: 2, major: 1, minor: 1, build: 0 };
    },
    listDevices(localOnly = false) {
      calls.push(["listDevices", localOnly]);
      return [{ name: "test:0", vendor: "ACME", model: "Scan", type: "flatbed" }];
    },
    openDevice(name) {
      calls.push(["openDevice", name]);
      return {
        name,
        close() {
          calls.push(["close", name]);
        },
        getOptionDescriptors() {
          calls.push(["getOptionDescriptors", name]);
          return [];
        },
        getOptionValue(key) {
          calls.push(["getOptionValue", name, key]);
          return null;
        },
        getStatus() {
          calls.push(["getStatus", name]);
          return { deviceName: name };
        },
        getParameters() {
          calls.push(["getParameters", name]);
          return {
            format: "gray",
            formatCode: 0,
            lastFrame: true,
            bytesPerLine: 100,
            pixelsPerLine: 100,
            lines: 200,
            depth: 8,
          };
        },
        setOptionValue(key, value) {
          calls.push(["setOptionValue", name, key, value]);
          return {
            info: 0,
            inexact: false,
            reloadOptions: false,
            reloadParameters: false,
            value,
          };
        },
        setOptionAuto(key) {
          calls.push(["setOptionAuto", name, key]);
          return {
            info: 0,
            inexact: false,
            reloadOptions: false,
            reloadParameters: false,
            value: 300,
          };
        },
        triggerOption(key) {
          calls.push(["triggerOption", name, key]);
          return {
            info: 0,
            inexact: false,
            reloadOptions: false,
            reloadParameters: false,
            value: null,
          };
        },
        start() {
          calls.push(["start", name]);
          return {
            format: "gray",
            formatCode: 0,
            lastFrame: true,
            bytesPerLine: 100,
            pixelsPerLine: 100,
            lines: 200,
            depth: 8,
          };
        },
        read(maxLength) {
          calls.push(["read", name, maxLength]);
          return {
            bytesRead: 3,
            eof: false,
            data: Buffer.from([1, 2, 3]),
          };
        },
        cancel() {
          calls.push(["cancel", name]);
        },
        setIoMode(nonBlocking) {
          calls.push(["setIoMode", name, nonBlocking]);
        },
        getSelectFd() {
          calls.push(["getSelectFd", name]);
          return null;
        },
      };
    },
  };

  const api = createApi(native);
  assert.deepEqual(api.init(), { code: 1, major: 1, minor: 0, build: 0 });
  assert.deepEqual(api.getVersion(), { code: 2, major: 1, minor: 1, build: 0 });
  assert.deepEqual(api.listDevices(true), [
    { name: "test:0", vendor: "ACME", model: "Scan", type: "flatbed" },
  ]);
  api.exit();

  assert.deepEqual(calls, [
    ["init"],
    ["getVersion"],
    ["listDevices", true],
    ["exit"],
  ]);
});

test("openDevice wraps the native handle in a SaneDeviceConnection", () => {
  const calls = [];
  const descriptors = [
    {
      index: 0,
      name: "",
      title: "Number of options",
      description: "",
      type: "int",
      unit: "none",
      size: 4,
      cap: 0,
      isActive: true,
      isSettable: false,
      constraint: null,
    },
  ];

  const api = createApi({
    init() {
      throw new Error("unused");
    },
    exit() {},
    getVersion() {
      throw new Error("unused");
    },
    listDevices() {
      throw new Error("unused");
    },
    openDevice(name) {
      calls.push(["openDevice", name]);
      return {
        name,
        close() {
          calls.push(["close", name]);
        },
        getOptionDescriptors() {
          calls.push(["getOptionDescriptors", name]);
          return descriptors;
        },
        getOptionValue(key) {
          calls.push(["getOptionValue", name, key]);
          return true;
        },
        getStatus() {
          calls.push(["getStatus", name]);
          return {
            deviceName: name,
            pageLoaded: true,
            coverOpen: false,
          };
        },
        getParameters() {
          calls.push(["getParameters", name]);
          return {
            format: "rgb",
            formatCode: 1,
            lastFrame: false,
            bytesPerLine: 300,
            pixelsPerLine: 100,
            lines: 200,
            depth: 8,
          };
        },
        setOptionValue(key, value) {
          calls.push(["setOptionValue", name, key, value]);
          return {
            info: 2,
            inexact: false,
            reloadOptions: true,
            reloadParameters: false,
            value,
          };
        },
        setOptionAuto(key) {
          calls.push(["setOptionAuto", name, key]);
          return {
            info: 4,
            inexact: false,
            reloadOptions: false,
            reloadParameters: true,
            value: 200,
          };
        },
        triggerOption(key) {
          calls.push(["triggerOption", name, key]);
          return {
            info: 0,
            inexact: false,
            reloadOptions: false,
            reloadParameters: false,
            value: null,
          };
        },
        start() {
          calls.push(["start", name]);
          return {
            format: "rgb",
            formatCode: 1,
            lastFrame: false,
            bytesPerLine: 300,
            pixelsPerLine: 100,
            lines: 200,
            depth: 8,
          };
        },
        read(maxLength) {
          calls.push(["read", name, maxLength]);
          return {
            bytesRead: 4,
            eof: false,
            data: Buffer.from([4, 5, 6, 7]),
          };
        },
        cancel() {
          calls.push(["cancel", name]);
        },
        setIoMode(nonBlocking) {
          calls.push(["setIoMode", name, nonBlocking]);
        },
        getSelectFd() {
          calls.push(["getSelectFd", name]);
          return 17;
        },
      };
    },
  });

  const device = api.openDevice("test:device");
  assert.ok(device instanceof SaneDeviceConnection);
  assert.equal(device.name, "test:device");
  assert.deepEqual(device.getOptionDescriptors(), descriptors);
  assert.equal(device.getOptionValue("page-loaded"), true);
  assert.deepEqual(device.getStatus(), {
    deviceName: "test:device",
    pageLoaded: true,
    coverOpen: false,
  });
  assert.deepEqual(device.getParameters(), {
    format: "rgb",
    formatCode: 1,
    lastFrame: false,
    bytesPerLine: 300,
    pixelsPerLine: 100,
    lines: 200,
    depth: 8,
  });
  assert.deepEqual(device.setOptionValue("resolution", 300), {
    info: 2,
    inexact: false,
    reloadOptions: true,
    reloadParameters: false,
    value: 300,
  });
  assert.deepEqual(device.setOptionAuto("resolution"), {
    info: 4,
    inexact: false,
    reloadOptions: false,
    reloadParameters: true,
    value: 200,
  });
  assert.deepEqual(device.triggerOption("scan"), {
    info: 0,
    inexact: false,
    reloadOptions: false,
    reloadParameters: false,
    value: null,
  });
  assert.deepEqual(device.start(), {
    format: "rgb",
    formatCode: 1,
    lastFrame: false,
    bytesPerLine: 300,
    pixelsPerLine: 100,
    lines: 200,
    depth: 8,
  });
  assert.deepEqual(device.read(8192), {
    bytesRead: 4,
    eof: false,
    data: Buffer.from([4, 5, 6, 7]),
  });
  device.setIoMode(true);
  assert.equal(device.getSelectFd(), 17);
  device.cancel();
  device.close();

  assert.deepEqual(calls, [
    ["openDevice", "test:device"],
    ["getOptionDescriptors", "test:device"],
    ["getOptionValue", "test:device", "page-loaded"],
    ["getStatus", "test:device"],
    ["getParameters", "test:device"],
    ["setOptionValue", "test:device", "resolution", 300],
    ["setOptionAuto", "test:device", "resolution"],
    ["triggerOption", "test:device", "scan"],
    ["start", "test:device"],
    ["read", "test:device", 8192],
    ["setIoMode", "test:device", true],
    ["getSelectFd", "test:device"],
    ["cancel", "test:device"],
    ["close", "test:device"],
  ]);
});
