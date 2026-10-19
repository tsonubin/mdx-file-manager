import { describe, expect, it, vi } from "vitest";
import { getSettings, validateProfile } from "../src/config";
import { Profile, ProviderType } from "../src/types";

const raw = vi.hoisted(() => ({ values: {} as Record<string, unknown> }));

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string, dflt: unknown) => (key in raw.values ? raw.values[key] : dflt)
    })
  }
}));

describe("validateProfile", () => {
  it("rejects providers outside the known set", () => {
    // Simulates malformed settings JSON; the type system cannot express it.
    const profile = {
      id: "x",
      name: "X",
      provider: "aws-s4" as unknown as ProviderType,
      bucket: "bucket",
      publicBaseUrl: "https://cdn.example.com"
    } satisfies Profile;

    expect(validateProfile(profile)).toContain("Profile provider must be one of aws-s3, cloudflare-r2, custom-s3.");
    expect(validateProfile({ ...profile, provider: "aws-s3" })).toEqual([]);
  });
});

describe("getSettings", () => {
  it("degrades malformed values to safe settings", () => {
    // A NaN size would disable the limit (NaN comparisons are false).
    raw.values.maxUploadSizeMB = "huge";
    raw.values.allowedExtensions = [".png", 42];
    raw.values.insertRules = [
      { when: { languageIds: "mdx" }, template: "x" },
      { when: { languageIds: ["MDX", 7] }, template: "y" }
    ];
    raw.values.profiles = "not-an-array";

    const settings = getSettings();
    expect(settings.maxUploadSizeMB).toBe(100);
    expect(settings.allowedExtensions).toEqual([".png"]);
    expect(settings.insertRules).toEqual([{ when: { languageIds: ["mdx"], extensions: [], mimePrefixes: [] }, template: "y" }]);
    expect(settings.profiles).toEqual([]);

    // Non-array allowlist must fall back to the default list, never to
    // "allow everything".
    raw.values.allowedExtensions = ".png";
    expect(getSettings().allowedExtensions).toContain(".png");

    raw.values = { maxUploadSizeMB: "25" };
    expect(getSettings().maxUploadSizeMB).toBe(25);
  });
});
