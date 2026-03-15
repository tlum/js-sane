import test from "node:test";
import assert from "node:assert/strict";

import {
  createApi,
  SaneDeviceConnection,
  SaneScanSession,
  SaneScanner,
  summarizeStatus,
} from "../dist/index.js";

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
  assert.equal(api.openScanner("test:0") instanceof SaneScanner, true);
  api.exit();

  assert.deepEqual(calls, [
    ["init"],
    ["getVersion"],
    ["listDevices", true],
    ["openDevice", "test:0"],
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

test("summarizeStatus normalizes common readiness and attention states", () => {
  assert.deepEqual(
    summarizeStatus({ deviceName: "test:device", pageLoaded: true }),
    {
      deviceName: "test:device",
      state: "ready",
      ready: true,
      attention: false,
      raw: { deviceName: "test:device", pageLoaded: true },
    },
  );

  assert.deepEqual(
    summarizeStatus({ deviceName: "test:device", coverOpen: true }),
    {
      deviceName: "test:device",
      state: "attention",
      ready: false,
      attention: true,
      raw: { deviceName: "test:device", coverOpen: true },
    },
  );
});

test("SaneScanSession reads chunks to EOF and stops cancelling after completion", () => {
  const calls = [];
  const device = new SaneDeviceConnection({
    name: "test:device",
    close() {
      calls.push(["close"]);
    },
    getOptionDescriptors() {
      throw new Error("unused");
    },
    getOptionValue() {
      throw new Error("unused");
    },
    getStatus() {
      throw new Error("unused");
    },
    getParameters() {
      throw new Error("unused");
    },
    setOptionValue() {
      throw new Error("unused");
    },
    setOptionAuto() {
      throw new Error("unused");
    },
    triggerOption() {
      throw new Error("unused");
    },
    start() {
      throw new Error("unused");
    },
    read(maxLength) {
      calls.push(["read", maxLength]);
      return calls.length === 1
        ? { bytesRead: 2, eof: false, data: Buffer.from([1, 2]) }
        : { bytesRead: 0, eof: true, data: Buffer.alloc(0) };
    },
    cancel() {
      calls.push(["cancel"]);
    },
    setIoMode() {
      throw new Error("unused");
    },
    getSelectFd() {
      throw new Error("unused");
    },
  });

  const session = new SaneScanSession(device, {
    format: "gray",
    formatCode: 0,
    lastFrame: true,
    bytesPerLine: 2,
    pixelsPerLine: 2,
    lines: 1,
    depth: 8,
  });

  assert.deepEqual(session.readAll(1024), Buffer.from([1, 2]));
  session.close();

  assert.deepEqual(calls, [
    ["read", 1024],
    ["read", 1024],
  ]);
});

test("SaneScanner wraps device orchestration and cleans up sessions", () => {
  const calls = [];
  const scanner = new SaneScanner(
    new SaneDeviceConnection({
      name: "test:device",
      close() {
        calls.push(["close"]);
      },
      getOptionDescriptors() {
        calls.push(["getOptionDescriptors"]);
        return [];
      },
      getOptionValue(key) {
        calls.push(["getOptionValue", key]);
        return null;
      },
      getStatus() {
        calls.push(["getStatus"]);
        return { deviceName: "test:device", warmup: true };
      },
      getParameters() {
        calls.push(["getParameters"]);
        return {
          format: "gray",
          formatCode: 0,
          lastFrame: true,
          bytesPerLine: 2,
          pixelsPerLine: 2,
          lines: 1,
          depth: 8,
        };
      },
      setOptionValue(key, value) {
        calls.push(["setOptionValue", key, value]);
        return { info: 0, inexact: false, reloadOptions: false, reloadParameters: false, value };
      },
      setOptionAuto(key) {
        calls.push(["setOptionAuto", key]);
        return { info: 0, inexact: false, reloadOptions: false, reloadParameters: false, value: 1 };
      },
      triggerOption(key) {
        calls.push(["triggerOption", key]);
        return { info: 0, inexact: false, reloadOptions: false, reloadParameters: false, value: null };
      },
      start() {
        calls.push(["start"]);
        return {
          format: "gray",
          formatCode: 0,
          lastFrame: true,
          bytesPerLine: 2,
          pixelsPerLine: 2,
          lines: 1,
          depth: 8,
        };
      },
      read(maxLength) {
        calls.push(["read", maxLength]);
        return { bytesRead: 0, eof: true, data: Buffer.alloc(0) };
      },
      cancel() {
        calls.push(["cancel"]);
      },
      setIoMode(nonBlocking) {
        calls.push(["setIoMode", nonBlocking]);
      },
      getSelectFd() {
        calls.push(["getSelectFd"]);
        return 9;
      },
    }),
  );

  assert.deepEqual(scanner.getStatusSummary(), {
    deviceName: "test:device",
    state: "warming-up",
    ready: false,
    attention: false,
    raw: { deviceName: "test:device", warmup: true },
  });
  assert.equal(scanner.getSelectFd(), 9);
  assert.equal(scanner.withSession((session) => session instanceof SaneScanSession), true);
  scanner.close();

  assert.deepEqual(calls, [
    ["getStatus"],
    ["getSelectFd"],
    ["start"],
    ["cancel"],
    ["close"],
  ]);
});

test("SaneScanner pollOnce defaults to ADF-ready auto-start", () => {
  const scanner = new SaneScanner(
    new SaneDeviceConnection({
      name: "test:device",
      close() {},
      getOptionDescriptors() {
        throw new Error("unused");
      },
      getOptionValue() {
        throw new Error("unused");
      },
      getStatus() {
        return { deviceName: "test:device", pageLoaded: true, coverOpen: false };
      },
      getParameters() {
        throw new Error("unused");
      },
      setOptionValue() {
        throw new Error("unused");
      },
      setOptionAuto() {
        throw new Error("unused");
      },
      triggerOption() {
        throw new Error("unused");
      },
      start() {
        throw new Error("unused");
      },
      read() {
        throw new Error("unused");
      },
      cancel() {},
      setIoMode() {},
      getSelectFd() {
        return null;
      },
    }),
  );

  assert.deepEqual(scanner.pollOnce(), {
    status: { deviceName: "test:device", pageLoaded: true, coverOpen: false },
    summary: {
      deviceName: "test:device",
      state: "ready",
      ready: true,
      attention: false,
      raw: { deviceName: "test:device", pageLoaded: true, coverOpen: false },
    },
    ready: true,
    shouldStart: true,
  });
});

test("SaneScanner waitForStart can require both ADF-ready and scan button", async () => {
  const statuses = [
    { deviceName: "test:device", pageLoaded: false, scanButton: false },
    { deviceName: "test:device", pageLoaded: true, scanButton: false },
    { deviceName: "test:device", pageLoaded: true, scanButton: true },
  ];

  const scanner = new SaneScanner(
    new SaneDeviceConnection({
      name: "test:device",
      close() {},
      getOptionDescriptors() {
        throw new Error("unused");
      },
      getOptionValue() {
        throw new Error("unused");
      },
      getStatus() {
        return statuses.shift() ?? { deviceName: "test:device", pageLoaded: true, scanButton: true };
      },
      getParameters() {
        throw new Error("unused");
      },
      setOptionValue() {
        throw new Error("unused");
      },
      setOptionAuto() {
        throw new Error("unused");
      },
      triggerOption() {
        throw new Error("unused");
      },
      start() {
        throw new Error("unused");
      },
      read() {
        throw new Error("unused");
      },
      cancel() {},
      setIoMode() {},
      getSelectFd() {
        return null;
      },
    }),
    {
      pollIntervalMs: 0,
      shouldStart(_device, status, ready) {
        return ready && status.scanButton === true;
      },
    },
  );

  assert.deepEqual(await scanner.waitForStart(), {
    status: { deviceName: "test:device", pageLoaded: true, scanButton: true },
    summary: {
      deviceName: "test:device",
      state: "ready",
      ready: true,
      attention: false,
      raw: { deviceName: "test:device", pageLoaded: true, scanButton: true },
    },
    ready: true,
    shouldStart: true,
  });
});

test("SaneScanner waitForStart times out when start conditions are never met", async () => {
  const scanner = new SaneScanner(
    new SaneDeviceConnection({
      name: "test:device",
      close() {},
      getOptionDescriptors() {
        throw new Error("unused");
      },
      getOptionValue() {
        throw new Error("unused");
      },
      getStatus() {
        return { deviceName: "test:device", pageLoaded: false };
      },
      getParameters() {
        throw new Error("unused");
      },
      setOptionValue() {
        throw new Error("unused");
      },
      setOptionAuto() {
        throw new Error("unused");
      },
      triggerOption() {
        throw new Error("unused");
      },
      start() {
        throw new Error("unused");
      },
      read() {
        throw new Error("unused");
      },
      cancel() {},
      setIoMode() {},
      getSelectFd() {
        return null;
      },
    }),
    { pollIntervalMs: 1 },
  );

  await assert.rejects(
    scanner.waitForStart({ timeoutMs: 5 }),
    /waitForStart timed out/,
  );
});
