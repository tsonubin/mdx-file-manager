import { describe, expect, it, vi } from "vitest";
import { validateProfile } from "../src/config";
import { Profile, ProviderType } from "../src/types";

vi.mock("vscode", () => ({}));

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
