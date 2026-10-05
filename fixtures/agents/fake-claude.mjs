import fs from "node:fs/promises";
import path from "node:path";

if (process.argv.includes("--version")) {
  process.stdout.write("fake-claude 0.0.1\n");
  process.exit(0);
}

const workspace = process.env.PLH_WORKSPACE;
if (!workspace) process.exit(2);

await fs.mkdir(path.join(workspace, "src"), { recursive: true });
await fs.writeFile(
  path.join(workspace, "src/value.mjs"),
  "export const value = 2;\n"
);

process.stdout.write("fake claude completed\n");

