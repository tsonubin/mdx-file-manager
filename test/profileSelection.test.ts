import { describe, expect, it } from "vitest";
import { resolveProfileFromDefaults } from "../src/profile/selection";

const profiles = [
  { id: "a", name: "A", provider: "aws-s3", bucket: "b", publicBaseUrl: "https://cdn-a.example.com" },
  { id: "b", name: "B", provider: "cloudflare-r2", bucket: "b", publicBaseUrl: "https://cdn-b.example.com", accountId: "acc" }
] as const;

describe("resolveProfileFromDefaults", () => {
  it("prefers session profile", () => {
    const result = resolveProfileFromDefaults({
      profiles: [...profiles],
      sessionProfileId: "b",
      workspaceDefaultProfile: "a",
      defaultProfile: "a"
    });

    expect(result.profile?.id).toBe("b");
    expect(result.source).toBe("session");
  });

  it("falls back to workspace then user", () => {
    const workspace = resolveProfileFromDefaults({
      profiles: [...profiles],
      workspaceDefaultProfile: "b",
      defaultProfile: "a"
    });

    expect(workspace.profile?.id).toBe("b");
    expect(workspace.source).toBe("workspaceDefault");

    const user = resolveProfileFromDefaults({
      profiles: [...profiles],
      workspaceDefaultProfile: "missing",
      defaultProfile: "a"
    });

    expect(user.profile?.id).toBe("a");
    expect(user.source).toBe("userDefault");
  });

  it("returns single profile when only one exists", () => {
    const result = resolveProfileFromDefaults({
      profiles: [profiles[0]]
    });

    expect(result.profile?.id).toBe("a");
    expect(result.source).toBe("single");
  });
});
