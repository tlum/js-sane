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

export interface SaneApi {
  init(): SaneVersion;
  exit(): void;
  getVersion(): SaneVersion;
  listDevices(localOnly?: boolean): SaneDevice[];
  openDevice(name: string): SaneDeviceConnection;
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

export function openScanner(name: string): SaneDeviceConnection {
  return openDevice(name);
}
