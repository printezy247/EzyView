/**
 * Polyfills for ES2023 Array methods on older WebKitGTK / browser runtimes.
 * Guarantees zero crashes if any library or module invokes toSorted, toReversed, toSpliced, or with.
 */

/* eslint-disable no-extend-native */
if (typeof Array.prototype.toSorted !== "function") {
  Object.defineProperty(Array.prototype, "toSorted", {
    value: function <T>(this: T[], compareFn?: (a: T, b: T) => number): T[] {
      return [...this].sort(compareFn);
    },
    writable: true,
    configurable: true,
  });
}

if (typeof Array.prototype.toReversed !== "function") {
  Object.defineProperty(Array.prototype, "toReversed", {
    value: function <T>(this: T[]): T[] {
      return [...this].reverse();
    },
    writable: true,
    configurable: true,
  });
}

if (typeof Array.prototype.toSpliced !== "function") {
  Object.defineProperty(Array.prototype, "toSpliced", {
    value: function <T>(this: T[], start: number, deleteCount?: number, ...items: T[]): T[] {
      const copy = [...this];
      if (deleteCount === undefined) {
        copy.splice(start);
      } else {
        copy.splice(start, deleteCount, ...items);
      }
      return copy;
    },
    writable: true,
    configurable: true,
  });
}
