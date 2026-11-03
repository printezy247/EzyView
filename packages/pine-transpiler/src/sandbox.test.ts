import { describe, expect, it } from "vitest";
import { PineUnsupportedError } from "./transpile.js";
import { transpile } from "./transpile.js";

/**
 * Regression net for the sandbox denylist.
 *
 * Every name here is a way out of the Pine sandbox if it slips through, so a
 * new global added to the host runtime must be added here too.
 */
const HOST_GLOBALS = [
  "globalThis",
  "window",
  "self",
  "top",
  "parent",
  "frames",
  "document",
  "navigator",
  "history",
  "screen",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "caches",
  "crypto",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "Worker",
  "SharedWorker",
  "ServiceWorker",
  "Notification",
  "importScripts",
  "WebAssembly",
  "atob",
  "btoa",
  "Function",
  "eval",
  "constructor",
  "process",
  "require",
  "module",
  "exports",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "queueMicrotask",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "postMessage",
  "structuredClone",
  "performance",
  "Promise",
  "Reflect",
  "Proxy",
];

describe("Pine sandbox denylist", () => {
  it("rejects every host global", () => {
    for (const name of HOST_GLOBALS) {
      expect(() => transpile(name), name).toThrow(PineUnsupportedError);
    }
  });

  it("rejects the host globals reached through a member", () => {
    expect(() => transpile('plot(self.fetch("http://127.0.0.1:8765/order"))')).toThrow(PineUnsupportedError);
    expect(() => transpile("x = window.location.href")).toThrow(PineUnsupportedError);
    expect(() => transpile("x = navigator.sendBeacon")).toThrow(PineUnsupportedError);
    expect(() => transpile("x = document.cookie")).toThrow(PineUnsupportedError);
    expect(() => transpile("x = localStorage.getItem")).toThrow(PineUnsupportedError);
  });

  it("rejects the built-ins that lead back to Function", () => {
    for (const name of ["Object", "Array", "JSON", "Math", "Symbol", "Date", "Intl", "Map", "Set", "WeakMap"]) {
      expect(() => transpile(`x = ${name}`), name).toThrow(PineUnsupportedError);
    }
  });

  it("rejects the prototype-walk escape", () => {
    const escape =
      'g = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ta.sma), "constructor").value("return 1")';
    expect(() => transpile(escape)).toThrow(PineUnsupportedError);
  });

  it("rejects the dangerous member names", () => {
    for (const m of ["constructor", "__proto__", "prototype", "then", "call", "apply", "bind", "toString", "valueOf"]) {
      expect(() => transpile(`close.${m}`), m).toThrow(PineUnsupportedError);
    }
  });
});
