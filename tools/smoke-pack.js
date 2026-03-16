const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "pipe",
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd}\n${output}`.trim());
  }

  return result.stdout.trim();
}

function main() {
  const packJson = run("npm", ["pack", "--json"], repoRoot);
  const packInfo = JSON.parse(packJson);
  const tarballName = packInfo[0]?.filename;
  if (!tarballName) {
    throw new Error("npm pack --json did not return a tarball filename");
  }

  const tarballPath = path.join(repoRoot, tarballName);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "js-sane-pack-"));

  try {
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "js-sane-smoke", private: true }, null, 2) + "\n",
      "utf8",
    );

    run("npm", ["install", tarballPath], tempDir);
    run("node", ["-e", "require('@tlum/js-sane')"], tempDir);

    console.log(`Packed artifact smoke test passed: ${tarballName}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(tarballPath, { force: true });
  }
}

main();
