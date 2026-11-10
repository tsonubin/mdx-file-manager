import { describe, expect, it } from "vitest";
import { describeError } from "../src/utils";

describe("describeError", () => {
  it("leads with error name and HTTP status when present", () => {
    const s3Like = Object.assign(new Error("Access Denied"), {
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 }
    });

    expect(describeError(s3Like)).toBe("AccessDenied — HTTP 403 — Access Denied");
    expect(describeError(new Error("boom"))).toBe("boom");
    expect(describeError(new Error(""))).toBe("no details");
    expect(describeError("plain text")).toBe("plain text");
  });
});
