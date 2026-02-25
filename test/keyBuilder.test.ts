import { describe, expect, it } from "vitest";
import { buildObjectKey, buildScopePrefix } from "../src/upload/keyBuilder";

describe("keyBuilder", () => {
  it("builds path-scoped prefix", () => {
    const prefix = buildScopePrefix(
      { relativeDir: "content/blog/Hello World", fileBaseName: "My Post" },
      {
        id: "a",
        name: "A",
        provider: "aws-s3",
        bucket: "bucket",
        publicBaseUrl: "https://cdn.example.com",
        basePrefix: "assets"
      }
    );

    expect(prefix).toBe("assets/content/blog/hello-world/my-post");
  });

  it("builds object key with suffix", () => {
    const key = buildObjectKey("assets/posts/demo", "/tmp/My Image.PNG", "abc123");
    expect(key).toBe("assets/posts/demo/my-image-abc123.png");
  });
});
