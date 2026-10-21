import { describe, expect, it } from "vitest";
import { validateProxy } from "./shell";

describe("validateProxy", () => {
  it("accepts empty and http/https/socks5 URLs", () => {
    for (const ok of ["", "http://127.0.0.1:8080", "https://p.example", "socks5://proxy.local:1080"]) {
      expect(validateProxy(ok)).toBe(true);
    }
  });

  it("rejects other schemes, bare hosts, whitespace and control chars", () => {
    for (const bad of ["ftp://x", "127.0.0.1:8080", "http://a b", "http://x\n", "javascript:alert(1)", `http://${"a".repeat(300)}`]) {
      expect(validateProxy(bad)).toBe(false);
    }
  });
});
