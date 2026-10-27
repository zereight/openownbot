// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { acquireSingleInstanceLock } from "./single-instance-lock";

function dependencies(requests: boolean[], isDevelopment: boolean) {
  const request = vi.fn(() => requests.shift() ?? false);
  const sleep = vi.fn();
  const log = vi.fn();
  return { request, sleep, log, acquire: () => acquireSingleInstanceLock({ request, isDevelopment, sleep, log }) };
}

describe("acquireSingleInstanceLock", () => {
  it("returns at once when the first request succeeds", () => {
    const dev = dependencies([true], true);
    expect(dev.acquire()).toBe(true);
    expect(dev.request).toHaveBeenCalledTimes(1);
    expect(dev.sleep).not.toHaveBeenCalled();

    const prod = dependencies([true], false);
    expect(prod.acquire()).toBe(true);
    expect(prod.request).toHaveBeenCalledTimes(1);
    expect(prod.sleep).not.toHaveBeenCalled();
  });

  it("exits a packaged second launch without waiting", () => {
    const prod = dependencies([false], false);

    expect(prod.acquire()).toBe(false);
    expect(prod.request).toHaveBeenCalledTimes(1);
    expect(prod.sleep).not.toHaveBeenCalled();
    expect(prod.log).not.toHaveBeenCalled();
  });

  it("waits in development until the previous instance releases the lock", () => {
    const dev = dependencies([false, false, true], true);

    expect(dev.acquire()).toBe(true);
    expect(dev.request).toHaveBeenCalledTimes(3);
    expect(dev.sleep).toHaveBeenCalledTimes(2);
    expect(dev.sleep).toHaveBeenCalledWith(250);
    expect(dev.log).toHaveBeenCalledTimes(2);
  });

  it("gives up after a minute and exits like a second launch", () => {
    const dev = dependencies([], true);

    expect(dev.acquire()).toBe(false);
    // One try plus a 250ms poll for each slice of the minute.
    expect(dev.request).toHaveBeenCalledTimes(241);
    expect(dev.sleep).toHaveBeenCalledTimes(240);
    expect(dev.log).toHaveBeenCalledTimes(2);
  });
});
