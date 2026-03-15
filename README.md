# js-sane

Initial scaffold for a Node.js addon that links against Linux `libsane`.

## Prerequisites

- Node.js 20+
- A C/C++ toolchain compatible with `node-gyp`
- SANE development headers and shared library, typically provided by a package such as `libsane-dev`

## Install

```bash
npm install
```

`npm install` only installs the JavaScript toolchain. The native addon build is intentionally explicit so the package can be set up before `libsane` development headers are present.

## Build

```bash
npm run build
```

The native addon links with `-lsane`, so the system linker must be able to find `libsane.so`, and `sane/sane.h` must be installed before `npm run build:addon` or `npm run build`.

## Current API

```ts
import { init, exit, listDevices, openScanner } from "js-sane";

init();
const devices = listDevices(true);
const scanner = openScanner(devices[0].name);

const poll = await scanner.waitForStart();
console.log(poll);

scanner.setOptionValue("resolution", 300);

scanner.withSession((scan) => {
  console.log(scan.parameters);
  const image = scan.readAll(32768);
  console.log(image.length);
});

scanner.close();
exit();
```

`listDevices(true)` limits discovery to local devices. `false` allows backends that expose remote devices.

The addon now exposes:

- `init()` and `exit()` for explicit SANE library lifecycle control.
- `getVersion()` for the negotiated SANE version.
- `listDevices(localOnly?)` for backend device discovery.
- `openScanner(name, options?)` for polling and session orchestration.
- `openDevice(name)` returning a device handle with:
  `close()`, `getOptionDescriptors()`, `getOptionValue(key)`, `setOptionValue(key, value)`, `setOptionAuto(key)`, `triggerOption(key)`, `getStatus()`, `getParameters()`, `start()`, `read(maxLength?)`, `cancel()`, `setIoMode(nonBlocking)`, and `getSelectFd()`.

`openScanner(name, options?)` wraps a device connection with:

- `pollOnce()` for a single readiness/start snapshot
- `waitForStart()` for polling until batch-start conditions are met
- `getStatusSummary()` for normalized states like `ready`, `warming-up`, `attention`, and `idle`
- `startSession()` for explicit frame reading via a `SaneScanSession`
- `withSession(fn)` to ensure `cancel()` cleanup happens even if the read loop throws

By default, `waitForStart()` treats `pageLoaded === true`, `coverOpen !== true`, and `warmup !== true` as ready and starts immediately when ready. For workflows that require both paper in the ADF and a front-panel button press, pass a custom `shouldStart` predicate:

```ts
const scanner = openScanner(deviceName, {
  shouldStart(_device, status, ready) {
    return ready && status.scanButton === true;
  },
});
```

`getStatus()` reads portable sensor/button options when the backend exposes them, including standard names such as `page-loaded`, `cover-open`, `warmup`, and front-panel button flags. For backend-specific status signals, use `getOptionDescriptors()` plus `getOptionValue(nameOrIndex)`.

`start()` calls `sane_start()` and immediately returns the negotiated `SANE_Parameters` snapshot for the frame that is about to be read.

`read()` returns a `Buffer` chunk plus `bytesRead` and `eof`. For event-loop integration, `setIoMode(true)` requests nonblocking mode and `getSelectFd()` returns the backend file descriptor when supported.
