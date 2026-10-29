import { describe, expect, it } from "vitest";
import { migrateUserData, type UserDataMigrationDependencies } from "./user-data-migration";

function setup(options: { existing: string[]; legacyRunning?: boolean; copyFails?: boolean }) {
  const paths = new Set(options.existing);
  const calls: string[] = [];
  const dependencies: UserDataMigrationDependencies = {
    exists: (path) => paths.has(path),
    legacyIsRunning: () => options.legacyRunning ?? false,
    copyDirectory: (from, to) => {
      calls.push(`copy ${from} -> ${to}`);
      paths.add(to);
      if (options.copyFails) throw new Error("disk full");
    },
    rename: (from, to) => {
      calls.push(`rename ${from} -> ${to}`);
      paths.delete(from);
      paths.add(to);
    },
    remove: (path) => {
      calls.push(`remove ${path}`);
      paths.delete(path);
    },
  };
  return { paths, calls, dependencies };
}

describe("migrateUserData", () => {
  it("does nothing on a first start with no old folder", () => {
    const { calls, dependencies } = setup({ existing: [] });
    expect(migrateUserData("/old", "/new", dependencies)).toBe("not-needed");
    expect(calls).toEqual([]);
  });

  it("does nothing when the new folder already exists", () => {
    const { calls, dependencies } = setup({ existing: ["/old", "/new"] });
    expect(migrateUserData("/old", "/new", dependencies)).toBe("not-needed");
    expect(calls).toEqual([]);
  });

  it("copies the old folder beside the new one and renames it into place", () => {
    const { paths, calls, dependencies } = setup({ existing: ["/old"] });
    expect(migrateUserData("/old", "/new", dependencies)).toBe("migrated");
    expect(calls).toEqual(["copy /old -> /new.migrating", "rename /new.migrating -> /new"]);
    expect(paths.has("/old")).toBe(true);
    expect(paths.has("/new")).toBe(true);
  });

  it("leaves everything as it was while the old app still runs", () => {
    const { calls, dependencies } = setup({ existing: ["/old"], legacyRunning: true });
    expect(migrateUserData("/old", "/new", dependencies)).toBe("legacy-in-use");
    expect(calls).toEqual([]);
  });

  it("removes a half-copied folder left by an earlier start before copying again", () => {
    const { calls, dependencies } = setup({ existing: ["/old", "/new.migrating"] });
    expect(migrateUserData("/old", "/new", dependencies)).toBe("migrated");
    expect(calls[0]).toBe("remove /new.migrating");
  });

  it("removes the partial copy and keeps the old folder when copying fails", () => {
    const { paths, calls, dependencies } = setup({ existing: ["/old"], copyFails: true });
    expect(migrateUserData("/old", "/new", dependencies)).toBe("failed");
    expect(calls.at(-1)).toBe("remove /new.migrating");
    expect(paths.has("/new")).toBe(false);
    expect(paths.has("/old")).toBe(true);
  });
});
