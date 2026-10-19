import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { Profile } from "../src/types";
import { S3Uploader } from "../src/upload/s3Uploader";

describe("S3Uploader.keyExists", () => {
  it("reports unknown when the store forbids HeadObject on missing keys", async () => {
    let headStatus = 404;
    const server = createServer((_request, response) => {
      response.writeHead(headStatus);
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("stub server must report a port");
    }

    const profile = {
      id: "stub",
      name: "Stub",
      provider: "custom-s3",
      bucket: "bucket",
      endpoint: `http://127.0.0.1:${address.port}`,
      publicBaseUrl: "https://cdn.example.com",
      forcePathStyle: true
    } satisfies Profile;
    const uploader = new S3Uploader(profile, { accessKeyId: "a", secretAccessKey: "b" });

    try {
      expect(await uploader.keyExists("assets/a.png")).toBe(false);
      headStatus = 403;
      expect(await uploader.keyExists("assets/a.png")).toBe("unknown");
      headStatus = 200;
      expect(await uploader.keyExists("assets/a.png")).toBe(true);
    } finally {
      server.close();
    }
  });
});
