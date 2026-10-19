import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { Profile } from "../src/types";
import { S3Uploader } from "../src/upload/s3Uploader";

describe("S3Uploader", () => {
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

  it("keeps the read-only connection check free of writes and cleans up its probe otherwise", async () => {
    const requests: Array<{ method: string; path: string }> = [];
    const server = createServer((request, response) => {
      request.resume();
      requests.push({ method: request.method ?? "", path: (request.url ?? "").split("?")[0] });
      if (request.method === "GET") {
        response.writeHead(200, { "content-type": "application/xml" });
        response.end(
          '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>bucket</Name><KeyCount>0</KeyCount><MaxKeys>1</MaxKeys><IsTruncated>false</IsTruncated></ListBucketResult>'
        );
        return;
      }
      response.writeHead(200);
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
      await uploader.validateConnection({ readOnly: true });
      expect(requests.map((entry) => entry.method)).toEqual(["GET"]);

      requests.length = 0;
      await uploader.validateConnection();
      expect(requests.map((entry) => entry.method)).toEqual(["GET", "PUT", "DELETE"]);
      expect(requests[1].path).toContain("__mdx_asset_manager_probe__/");
      expect(requests[2].path).toBe(requests[1].path);
    } finally {
      server.close();
    }
  });
});
