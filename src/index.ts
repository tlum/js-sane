import { loadAddon } from "./addon-loader";

export interface SaneVersion {
  code: number;
  major: number;
  minor: number;
  build: number;
}

export interface SaneDevice {
  name: string;
  vendor: string;
  model: string;
  type: string;
}

export interface SaneOptionConstraintRange {
  type: "range";
  min: number;
  max: number;
  quant: number;
}

export interface SaneOptionConstraintWordList {
  type: "wordList";
  values: number[];
}

export interface SaneOptionConstraintStringList {
  type: "stringList";
  values: string[];
}

export type SaneOptionConstraint =
  | SaneOptionConstraintRange
  | SaneOptionConstraintWordList
  | SaneOptionConstraintStringList
  | null;

export interface SaneOptionDescriptor {
  index: number;
  name: string;
  title: string;
  description: string;
  type: "bool" | "int" | "fixed" | "string" | "button" | "group" | "unknown";
  unit: "none" | "pixel" | "bit" | "mm" | "dpi" | "percent" | "microsecond" | "unknown";
  size: number;
  cap: number;
  isActive: boolean;
  isSettable: boolean;
  constraint: SaneOptionConstraint;
}

export type SaneOptionValue = boolean | number | string | number[] | null;

export interface SaneStatusSnapshot {
  deviceName: string;
  pageLoaded?: boolean | null;
  coverOpen?: boolean | null;
  warmup?: boolean | null;
  scanButton?: boolean | null;
  emailButton?: boolean | null;
  faxButton?: boolean | null;
  copyButton?: boolean | null;
  pdfButton?: boolean | null;
  cancelButton?: boolean | null;
}

export interface SaneParameters {
  format: "gray" | "rgb" | "red" | "green" | "blue" | "unknown";
  formatCode: number;
  lastFrame: boolean;
  bytesPerLine: number;
  pixelsPerLine: number;
  lines: number;
  depth: number;
}

export interface SaneControlResult {
  info: number;
  inexact: boolean;
  reloadOptions: boolean;
  reloadParameters: boolean;
  value: SaneOptionValue;
}

export interface SaneReadResult {
  bytesRead: number;
  eof: boolean;
  data: Buffer;
}

export type SaneDeviceState = "unknown" | "idle" | "ready" | "warming-up" | "attention";

export interface SaneStatusSummary {
  deviceName: string;
  state: SaneDeviceState;
  ready: boolean;
  attention: boolean;
  raw: SaneStatusSnapshot;
}

export interface SaneScannerPollSnapshot {
  status: SaneStatusSnapshot;
  summary: SaneStatusSummary;
  ready: boolean;
  shouldStart: boolean;
}

export interface SaneScannerWaitOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface SaneScannerOptions {
  pollIntervalMs?: number;
  isReady?: (device: SaneDeviceConnection, status: SaneStatusSnapshot) => boolean;
  shouldStart?: (
    device: SaneDeviceConnection,
    status: SaneStatusSnapshot,
    ready: boolean,
  ) => boolean;
}

interface NativeDeviceHandle {
  name: string;
  close(): void;
  getOptionDescriptors(): SaneOptionDescriptor[];
  getOptionValue(key: number | string): SaneOptionValue;
  getStatus(): SaneStatusSnapshot;
  getParameters(): SaneParameters;
  setOptionValue(key: number | string, value: SaneOptionValue): SaneControlResult;
  setOptionAuto(key: number | string): SaneControlResult;
  triggerOption(key: number | string): SaneControlResult;
  start(): SaneParameters;
  read(maxLength?: number): SaneReadResult;
  cancel(): void;
  setIoMode(nonBlocking: boolean): void;
  getSelectFd(): number | null;
}

interface NativeAddon {
  init(): SaneVersion;
  exit(): void;
  getVersion(): SaneVersion;
  listDevices(localOnly?: boolean): SaneDevice[];
  openDevice(name: string): NativeDeviceHandle;
}

export class SaneDeviceConnection {
  constructor(private readonly handle: NativeDeviceHandle) {}

  get name(): string {
    return this.handle.name;
  }

  close(): void {
    this.handle.close();
  }

  getOptionDescriptors(): SaneOptionDescriptor[] {
    return this.handle.getOptionDescriptors();
  }

  getOptionValue(key: number | string): SaneOptionValue {
    return this.handle.getOptionValue(key);
  }

  getStatus(): SaneStatusSnapshot {
    return this.handle.getStatus();
  }

  getParameters(): SaneParameters {
    return this.handle.getParameters();
  }

  setOptionValue(key: number | string, value: SaneOptionValue): SaneControlResult {
    return this.handle.setOptionValue(key, value);
  }

  setOptionAuto(key: number | string): SaneControlResult {
    return this.handle.setOptionAuto(key);
  }

  triggerOption(key: number | string): SaneControlResult {
    return this.handle.triggerOption(key);
  }

  start(): SaneParameters {
    return this.handle.start();
  }

  read(maxLength?: number): SaneReadResult {
    return this.handle.read(maxLength);
  }

  cancel(): void {
    this.handle.cancel();
  }

  setIoMode(nonBlocking: boolean): void {
    this.handle.setIoMode(nonBlocking);
  }

  getSelectFd(): number | null {
    return this.handle.getSelectFd();
  }
}

export function summarizeStatus(status: SaneStatusSnapshot): SaneStatusSummary {
  if (status.coverOpen === true) {
    return {
      deviceName: status.deviceName,
      state: "attention",
      ready: false,
      attention: true,
      raw: status,
    };
  }

  if (status.warmup === true) {
    return {
      deviceName: status.deviceName,
      state: "warming-up",
      ready: false,
      attention: false,
      raw: status,
    };
  }

  if (status.pageLoaded === true) {
    return {
      deviceName: status.deviceName,
      state: "ready",
      ready: true,
      attention: false,
      raw: status,
    };
  }

  const hasKnownSignals =
    status.coverOpen !== undefined || status.warmup !== undefined || status.pageLoaded !== undefined;

  return {
    deviceName: status.deviceName,
    state: hasKnownSignals ? "idle" : "unknown",
    ready: false,
    attention: false,
    raw: status,
  };
}

export class SaneScanSession {
  private completed = false;
  private cancelled = false;

  constructor(
    private readonly device: SaneDeviceConnection,
    readonly parameters: SaneParameters,
  ) {}

  readChunk(maxLength = 32768): SaneReadResult {
    const chunk = this.device.read(maxLength);
    if (chunk.eof) {
      this.completed = true;
    }
    return chunk;
  }

  *readChunks(maxLength = 32768): Iterable<SaneReadResult> {
    for (;;) {
      const chunk = this.readChunk(maxLength);
      yield chunk;
      if (chunk.eof) {
        break;
      }
    }
  }

  readAll(maxLength = 32768): Buffer {
    const chunks: Buffer[] = [];
    for (const chunk of this.readChunks(maxLength)) {
      if (chunk.bytesRead > 0) {
        chunks.push(chunk.data);
      }
    }
    return Buffer.concat(chunks);
  }

  cancel(): void {
    if (this.cancelled || this.completed) {
      return;
    }
    this.device.cancel();
    this.cancelled = true;
  }

  close(): void {
    this.cancel();
  }
}

export class SaneScanner {
  private readonly pollIntervalMs: number;
  private readonly isReadyFn: (device: SaneDeviceConnection, status: SaneStatusSnapshot) => boolean;
  private readonly shouldStartFn: (
    device: SaneDeviceConnection,
    status: SaneStatusSnapshot,
    ready: boolean,
  ) => boolean;

  constructor(
    private readonly device: SaneDeviceConnection,
    options: SaneScannerOptions = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 250;
    this.isReadyFn = options.isReady ?? defaultIsReady;
    this.shouldStartFn = options.shouldStart ?? ((_, __, ready) => ready);
  }

  get name(): string {
    return this.device.name;
  }

  close(): void {
    this.device.close();
  }

  getOptionDescriptors(): SaneOptionDescriptor[] {
    return this.device.getOptionDescriptors();
  }

  getOptionValue(key: number | string): SaneOptionValue {
    return this.device.getOptionValue(key);
  }

  setOptionValue(key: number | string, value: SaneOptionValue): SaneControlResult {
    return this.device.setOptionValue(key, value);
  }

  setOptionAuto(key: number | string): SaneControlResult {
    return this.device.setOptionAuto(key);
  }

  triggerOption(key: number | string): SaneControlResult {
    return this.device.triggerOption(key);
  }

  getStatus(): SaneStatusSnapshot {
    return this.device.getStatus();
  }

  getStatusSummary(): SaneStatusSummary {
    return summarizeStatus(this.getStatus());
  }

  pollOnce(): SaneScannerPollSnapshot {
    const status = this.getStatus();
    const summary = summarizeStatus(status);
    const ready = this.isReadyFn(this.device, status);
    const shouldStart = this.shouldStartFn(this.device, status, ready);

    return {
      status,
      summary,
      ready,
      shouldStart,
    };
  }

  async waitForStart(options: SaneScannerWaitOptions = {}): Promise<SaneScannerPollSnapshot> {
    const deadline =
      options.timeoutMs === undefined ? undefined : Date.now() + options.timeoutMs;

    for (;;) {
      if (options.signal?.aborted) {
        throw new Error("waitForStart aborted");
      }

      const snapshot = this.pollOnce();
      if (snapshot.shouldStart) {
        return snapshot;
      }

      if (deadline !== undefined && Date.now() >= deadline) {
        throw new Error("waitForStart timed out");
      }

      await sleep(this.pollIntervalMs, options.signal);
    }
  }

  getParameters(): SaneParameters {
    return this.device.getParameters();
  }

  setIoMode(nonBlocking: boolean): void {
    this.device.setIoMode(nonBlocking);
  }

  getSelectFd(): number | null {
    return this.device.getSelectFd();
  }

  startSession(): SaneScanSession {
    return new SaneScanSession(this.device, this.device.start());
  }

  withSession<T>(fn: (session: SaneScanSession) => T): T {
    const session = this.startSession();
    try {
      return fn(session);
    } finally {
      session.close();
    }
  }
}

export interface SaneApi {
  init(): SaneVersion;
  exit(): void;
  getVersion(): SaneVersion;
  listDevices(localOnly?: boolean): SaneDevice[];
  openDevice(name: string): SaneDeviceConnection;
  openScanner(name: string, options?: SaneScannerOptions): SaneScanner;
}

function defaultIsReady(_: SaneDeviceConnection, status: SaneStatusSnapshot): boolean {
  return status.coverOpen !== true && status.warmup !== true && status.pageLoaded === true;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new Error("waitForStart aborted"));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function createApi(native: NativeAddon): SaneApi {
  return {
    init(): SaneVersion {
      return native.init();
    },
    exit(): void {
      native.exit();
    },
    getVersion(): SaneVersion {
      return native.getVersion();
    },
    listDevices(localOnly = false): SaneDevice[] {
      return native.listDevices(localOnly);
    },
    openDevice(name: string): SaneDeviceConnection {
      return new SaneDeviceConnection(native.openDevice(name));
    },
    openScanner(name: string, options?: SaneScannerOptions): SaneScanner {
      return new SaneScanner(new SaneDeviceConnection(native.openDevice(name)), options);
    },
  };
}

let defaultApi: SaneApi | undefined;

function getDefaultApi(): SaneApi {
  defaultApi ??= createApi(loadAddon<NativeAddon>());
  return defaultApi;
}

export function init(): SaneVersion {
  return getDefaultApi().init();
}

export function exit(): void {
  getDefaultApi().exit();
}

export function getVersion(): SaneVersion {
  return getDefaultApi().getVersion();
}

export function listDevices(localOnly = false): SaneDevice[] {
  return getDefaultApi().listDevices(localOnly);
}

export function openDevice(name: string): SaneDeviceConnection {
  return getDefaultApi().openDevice(name);
}

export function openScanner(name: string, options?: SaneScannerOptions): SaneScanner {
  return getDefaultApi().openScanner(name, options);
}
