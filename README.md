# js-sane

Node.js addon scaffold that binds to Linux `libsane`.

## Prerequisites

- Node.js 20+
- A C/C++ toolchain compatible with `node-gyp`
- SANE development headers and shared library, typically provided by a package such as `libsane-dev`

## Install

```bash
npm install
```

`npm install` must leave the package usable. The native addon is expected to build during installation; if the host is missing the SANE headers/library or toolchain prerequisites, installation should fail immediately.

## Build

```bash
npm run build
```

The native addon links with `-lsane`, so the system linker must be able to find `libsane.so`, and `sane/sane.h` must be installed before `npm run build:addon` or `npm run build`.

## Packaging

For consumption from another project, prefer a real package artifact:

```bash
npm pack
```

That tarball includes the compiled JavaScript under `dist/`. The consumer should install the package artifact and let `js-sane` own its own native build/install contract.

You can validate the published artifact shape locally with:

```bash
npm run test:pack
```

That command packs the library, installs the tarball into a clean temporary project, and verifies that `require("@tlum/js-sane")` succeeds there.

## Current API

```ts
import { init, exit, listDevices, openDevice } from "js-sane";

init();
const devices = listDevices(true);
const device = openDevice(devices[0].name);

const status = device.getStatus();
device.setOptionValue("resolution", 300);
const parameters = device.start();
const chunk = device.read(32768);

console.log(status, parameters, chunk.bytesRead);

device.cancel();
device.close();
exit();
```

`listDevices(true)` limits discovery to local devices. `false` allows backends that expose remote devices.

The addon exposes one-shot binding primitives:

- `init()` and `exit()` for explicit SANE library lifecycle control.
- `getVersion()` for the negotiated SANE version.
- `listDevices(localOnly?)` for backend device discovery.
- `openDevice(name)` returning a device handle with:
  `close()`, `getOptionDescriptors()`, `getOptionValue(key)`, `setOptionValue(key, value)`, `setOptionAuto(key)`, `triggerOption(key)`, `getStatus()`, `getParameters()`, `start()`, `read(maxLength?)`, `cancel()`, `setIoMode(nonBlocking)`, and `getSelectFd()`.
- `openScanner(name)` as a thin alias for `openDevice(name)` if that naming fits the caller better.

Polling loops, timeout handling, and start conditions should live in the caller, for example in `scan-mgr`, using repeated `getStatus()` calls plus service-level state transitions.

Call `close()` on every opened device handle before calling `exit()`. The addon now treats `exit()` as orderly library shutdown, not implicit process-teardown cleanup.

`getStatus()` reads portable sensor/button options when the backend exposes them, including standard names such as `page-loaded`, `cover-open`, `warmup`, and front-panel button flags. For backend-specific status signals, use `getOptionDescriptors()` plus `getOptionValue(nameOrIndex)`.

`start()` calls `sane_start()` and immediately returns the negotiated `SANE_Parameters` snapshot for the frame that is about to be read.

`read()` returns a `Buffer` chunk plus `bytesRead` and `eof`. For event-loop integration, `setIoMode(true)` requests nonblocking mode and `getSelectFd()` returns the backend file descriptor when supported.
