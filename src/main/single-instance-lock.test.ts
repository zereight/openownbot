// @vitest-environment node

import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireSingleInstanceLock, lockHolderPid } from "./single-instance-lock";

function dependencies(options: { isDevelopment: boolean; holders?: (number | null)[]; granted?: boolean }) {
  const holders = [...(options.holders ?? [])];
  const request = vi.fn(() => options.granted ?? true);
  const holder = vi.fn(() => (holders.length > 1 ? (holders.shift() ?? null) : (holders[0] ?? null)));
  const isAlive = vi.fn((pid: number) => pid > 0);
  const sleep = vi.fn();
  const log = vi.fn();
  return {
    request,
    holder,
    sleep,
    log,
    acquire: () =>
      acquireSingleInstanceLock({ request, isDevelopment: options.isDevelopment, holder, isAlive, sleep, log }),
  };
}

describe("acquireSingleInstanceLock", () => {
  it("asks for the lock once and does not wait when nothing holds it", () => {
    const dev = dependencies({ isDevelopment: true, holders: [null] });

    expect(dev.acquire()).toBe(true);
    expect(dev.request).toHaveBeenCalledTimes(1);
    expect(dev.sleep).not.toHaveBeenCalled();
    expect(dev.log).not.toHaveBeenCalled();
  });

  it("does not wait for a holder whose process is already gone", () => {
    const dev = dependencies({ isDevelopment: true, holders: [-1] });

    expect(dev.acquire()).toBe(true);
    expect(dev.sleep).not.toHaveBeenCalled();
  });

  it("exits a packaged second launch at once, without reading who holds the lock", () => {
    const prod = dependencies({ isDevelopment: false, holders: [4242], granted: false });

    expect(prod.acquire()).toBe(false);
    expect(prod.request).toHaveBeenCalledTimes(1);
    expect(prod.holder).not.toHaveBeenCalled();
    expect(prod.sleep).not.toHaveBeenCalled();
    expect(prod.log).not.toHaveBeenCalled();
  });

  // A request that fails and is then retried leaves Electron without a `ready` event: the process
  // keeps the lock, opens no window and never starts. So the wait is on the holder, and the one
  // request comes after it.
  it("waits in development for the holder to exit, then asks for the lock exactly once", () => {
    const dev = dependencies({ isDevelopment: true, holders: [4242, 4242, null] });

    expect(dev.acquire()).toBe(true);
    expect(dev.sleep).toHaveBeenCalledTimes(2);
    expect(dev.sleep).toHaveBeenCalledWith(250);
    expect(dev.request).toHaveBeenCalledTimes(1);
    expect(dev.log).toHaveBeenCalledTimes(2);
  });

  it("gives up after a minute and exits like a second launch", () => {
    const dev = dependencies({ isDevelopment: true, holders: [4242], granted: false });

    expect(dev.acquire()).toBe(false);
    expect(dev.sleep).toHaveBeenCalledTimes(240);
    expect(dev.request).toHaveBeenCalledTimes(1);
    expect(dev.log).toHaveBeenCalledTimes(2);
  });
});

describe("lockHolderPid", () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  function profileWithLock(target?: string): string {
    const directory = mkdtempSync(join(tmpdir(), "openownbot-lock-"));
    directories.push(directory);
    if (target !== undefined) symlinkSync(target, join(directory, "SingletonLock"));
    return directory;
  }

  it("reads the process id Chromium writes into the lock", () => {
    expect(lockHolderPid(profileWithLock("some-host.local-99363"))).toBe(99363);
  });

  it("is null when no lock exists or the lock names no process", () => {
    expect(lockHolderPid(profileWithLock())).toBeNull();
    expect(lockHolderPid(profileWithLock("not-a-process"))).toBeNull();
    expect(lockHolderPid(join(tmpdir(), "openownbot-no-such-profile"))).toBeNull();
  });
});
