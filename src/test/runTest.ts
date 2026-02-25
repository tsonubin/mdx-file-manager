import * as fs from "node:fs/promises";
import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");
    const workspacePath = path.resolve(__dirname, "./fixtures/workspace");

    await fs.mkdir(workspacePath, { recursive: true });

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspacePath, "--disable-extensions"]
    });
  } catch (error) {
    console.error("Failed to run integration tests");
    console.error(error);
    process.exit(1);
  }
}

void main();
