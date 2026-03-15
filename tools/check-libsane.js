const fs = require("node:fs");
const path = require("node:path");

const includeRoots = [
  process.env.SANE_INCLUDE_DIR,
  "/usr/include",
  "/usr/local/include",
].filter(Boolean);

const headerCandidates = includeRoots.map((root) => path.join(root, "sane", "sane.h"));

const headerPath = headerCandidates.find((candidate) => fs.existsSync(candidate));

if (!headerPath) {
  console.error("Missing libsane development headers.");
  console.error("Expected to find sane/sane.h under one of:");
  for (const candidate of headerCandidates) {
    console.error(`- ${candidate}`);
  }
  console.error("");
  console.error("Install the SANE development package first, for example:");
  console.error("- Debian/Ubuntu/Raspberry Pi OS: apt install libsane-dev");
  console.error("- Fedora: dnf install sane-backends-devel");
  console.error("");
  console.error("If your headers are elsewhere, set SANE_INCLUDE_DIR to that include root.");
  process.exit(1);
}

console.log(`Using libsane headers from ${path.dirname(headerPath)}`);
