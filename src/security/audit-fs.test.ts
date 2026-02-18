import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatOctal,
  formatPermissionDetail,
  formatPermissionRemediation,
  inspectPathPermissions,
  isGroupReadable,
  isGroupWritable,
  isWorldReadable,
  isWorldWritable,
  modeBits,
  safeStat,
} from "./audit-fs.js";

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), "audit-fs-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  tmpDirs.length = 0;
});

describe("safeStat", () => {
  it("returns ok for existing file", async () => {
    const root = makeTmpDir();
    const file = path.join(root, "test.txt");
    fsSync.writeFileSync(file, "hello");
    const result = await safeStat(file);
    expect(result.ok).toBe(true);
    expect(result.isDir).toBe(false);
    expect(result.isSymlink).toBe(false);
    expect(result.mode).toBeTypeOf("number");
  });

  it("returns ok for directory", async () => {
    const root = makeTmpDir();
    const result = await safeStat(root);
    expect(result.ok).toBe(true);
    expect(result.isDir).toBe(true);
  });

  it("detects symlinks", async () => {
    const root = makeTmpDir();
    const target = path.join(root, "target");
    fsSync.writeFileSync(target, "hello");
    const link = path.join(root, "link");
    fsSync.symlinkSync(target, link);
    const result = await safeStat(link);
    expect(result.ok).toBe(true);
    expect(result.isSymlink).toBe(true);
  });

  it("returns error for nonexistent path", async () => {
    const result = await safeStat("/nonexistent/path/xyz");
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("inspectPathPermissions", () => {
  it("returns posix permissions for existing file", async () => {
    const root = makeTmpDir();
    const file = path.join(root, "test.txt");
    fsSync.writeFileSync(file, "hello");
    fsSync.chmodSync(file, 0o644);
    const result = await inspectPathPermissions(file);
    expect(result.ok).toBe(true);
    expect(result.source).toBe("posix");
    expect(result.worldReadable).toBe(true);
    expect(result.worldWritable).toBe(false);
    expect(result.groupReadable).toBe(true);
    expect(result.groupWritable).toBe(false);
  });

  it("returns error for nonexistent path", async () => {
    const result = await inspectPathPermissions("/nonexistent/path/xyz");
    expect(result.ok).toBe(false);
    expect(result.source).toBe("unknown");
    expect(result.error).toBeDefined();
  });

  it("detects world-writable files", async () => {
    const root = makeTmpDir();
    const file = path.join(root, "open.txt");
    fsSync.writeFileSync(file, "hello");
    fsSync.chmodSync(file, 0o666);
    const result = await inspectPathPermissions(file);
    expect(result.worldWritable).toBe(true);
    expect(result.groupWritable).toBe(true);
  });
});

describe("bit check functions with null", () => {
  it("isWorldWritable returns false for null", () => {
    expect(isWorldWritable(null)).toBe(false);
  });

  it("isGroupWritable returns false for null", () => {
    expect(isGroupWritable(null)).toBe(false);
  });

  it("isWorldReadable returns false for null", () => {
    expect(isWorldReadable(null)).toBe(false);
  });

  it("isGroupReadable returns false for null", () => {
    expect(isGroupReadable(null)).toBe(false);
  });
});

describe("modeBits", () => {
  it("returns null for null input", () => {
    expect(modeBits(null)).toBeNull();
  });

  it("extracts lower 9 bits", () => {
    expect(modeBits(0o100644)).toBe(0o644);
  });
});

describe("formatOctal", () => {
  it("returns 'unknown' for null", () => {
    expect(formatOctal(null)).toBe("unknown");
  });

  it("formats bits as octal string", () => {
    expect(formatOctal(0o755)).toBe("755");
    expect(formatOctal(0o600)).toBe("600");
  });
});

describe("formatPermissionDetail", () => {
  it("formats posix detail", () => {
    const detail = formatPermissionDetail("/foo", {
      ok: true,
      isSymlink: false,
      isDir: false,
      mode: 0o100644,
      bits: 0o644,
      source: "posix",
      worldWritable: false,
      groupWritable: false,
      worldReadable: true,
      groupReadable: true,
    });
    expect(detail).toBe("/foo mode=644");
  });

  it("formats windows-acl detail", () => {
    const detail = formatPermissionDetail("/foo", {
      ok: true,
      isSymlink: false,
      isDir: false,
      mode: null,
      bits: null,
      source: "windows-acl",
      worldWritable: false,
      groupWritable: false,
      worldReadable: false,
      groupReadable: false,
      aclSummary: "owner-only",
    });
    expect(detail).toBe("/foo acl=owner-only");
  });

  it("formats windows-acl detail with missing summary", () => {
    const detail = formatPermissionDetail("/foo", {
      ok: true,
      isSymlink: false,
      isDir: false,
      mode: null,
      bits: null,
      source: "windows-acl",
      worldWritable: false,
      groupWritable: false,
      worldReadable: false,
      groupReadable: false,
    });
    expect(detail).toBe("/foo acl=unknown");
  });
});

describe("formatPermissionRemediation", () => {
  it("formats posix remediation", () => {
    const result = formatPermissionRemediation({
      targetPath: "/foo/bar",
      perms: {
        ok: true,
        isSymlink: false,
        isDir: false,
        mode: 0o100644,
        bits: 0o644,
        source: "posix",
        worldWritable: false,
        groupWritable: false,
        worldReadable: true,
        groupReadable: true,
      },
      isDir: false,
      posixMode: 0o600,
    });
    expect(result).toBe("chmod 600 /foo/bar");
  });
});
