#!/usr/bin/env node

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const packageRoots = [
  { name: "root", dir: repoRoot },
  {
    name: "coin-price-data-fetcher",
    dir: path.join(repoRoot, "script", "coin-price-data-fetcher"),
  },
];

const failures = [];

const fail = (message) => {
  failures.push(message);
};

const readFile = (filePath) => fs.readFileSync(filePath, "utf8");

const readJson = (filePath) => JSON.parse(readFile(filePath));

const stableJson = (value) =>
  JSON.stringify(value || {}, Object.keys(value || {}).sort());

const parseVersion = (value) => {
  const match = String(value)
    .trim()
    .replace(/^v/, "")
    .match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);

  if (!match) {
    throw new Error(`Could not parse version: ${value}`);
  }

  return {
    raw: String(value).trim(),
    major: Number(match[1]),
    minor: Number(match[2] || 0),
    patch: Number(match[3] || 0),
  };
};

const compareVersions = (left, right) => {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] > right[key]) return 1;
    if (left[key] < right[key]) return -1;
  }
  return 0;
};

const satisfiesComparator = (version, comparator) => {
  const match = comparator.match(/^(>=|>|<=|<|=)?v?(\d+(?:\.\d+){0,2})$/);
  if (!match) {
    throw new Error(`Unsupported engine comparator: ${comparator}`);
  }

  const operator = match[1] || "=";
  const expected = parseVersion(match[2]);
  const comparison = compareVersions(version, expected);

  return (
    (operator === ">=" && comparison >= 0) ||
    (operator === ">" && comparison > 0) ||
    (operator === "<=" && comparison <= 0) ||
    (operator === "<" && comparison < 0) ||
    (operator === "=" && comparison === 0)
  );
};

const satisfiesRange = (version, range) =>
  range
    .split(/\s+/)
    .filter(Boolean)
    .every((comparator) => satisfiesComparator(version, comparator));

const getCurrentNpmVersion = () => {
  const userAgentMatch = (process.env.npm_config_user_agent || "").match(
    /\bnpm\/([^\s]+)/
  );

  if (userAgentMatch) {
    return parseVersion(userAgentMatch[1]);
  }

  return parseVersion(execFileSync("npm", ["--version"], { encoding: "utf8" }));
};

const readNpmrc = (dir) => {
  const npmrcPath = path.join(dir, ".npmrc");
  const settings = new Map();

  for (const line of readFile(npmrcPath).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    settings.set(
      trimmed.slice(0, separatorIndex).trim().toLowerCase(),
      trimmed
        .slice(separatorIndex + 1)
        .trim()
        .toLowerCase()
    );
  }

  return settings;
};

const countLeadingSpaces = (line) => line.match(/^\s*/)[0].length;

const getSetupNodeBlocks = (workflow) => {
  const lines = workflow.split(/\r?\n/);
  const blocks = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^\s*(?:-\s+)?uses:\s+["']?actions\/setup-node@/.test(line)) {
      continue;
    }

    const blockIndent = countLeadingSpaces(line);
    const blockLines = [line];

    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex];
      if (nextLine.trim() && countLeadingSpaces(nextLine) <= blockIndent) {
        break;
      }

      blockLines.push(nextLine);
    }

    blocks.push({ lineNumber: index + 1, text: blockLines.join("\n") });
  }

  return blocks;
};

const rootPackage = readJson(path.join(repoRoot, "package.json"));
const nvmrcVersion = parseVersion(readFile(path.join(repoRoot, ".nvmrc")));
const dockerfile = readFile(path.join(repoRoot, "Dockerfile"));
const workflowDir = path.join(repoRoot, ".github", "workflows");
const workflowFiles = fs
  .readdirSync(workflowDir)
  .filter((fileName) => /\.ya?ml$/.test(fileName))
  .sort();
const currentNodeVersion = parseVersion(process.version);
const currentNpmVersion = getCurrentNpmVersion();
const packageManagerMatch =
  rootPackage.packageManager && rootPackage.packageManager.match(/^npm@(.+)$/);
const dockerNodeImageMatches = [
  ...dockerfile.matchAll(
    /^\s*FROM\s+(?:--platform=\S+\s+)?node:([^\s]+)(?:\s+AS\s+\S+)?\s*$/gim
  ),
];
const dockerfileLines = dockerfile.split(/\r?\n/);

if (!packageManagerMatch) {
  fail('root packageManager must be declared as "npm@<version>"');
} else if (
  !satisfiesRange(parseVersion(packageManagerMatch[1]), rootPackage.engines.npm)
) {
  fail(
    `root packageManager ${rootPackage.packageManager} does not satisfy npm engine ${rootPackage.engines.npm}`
  );
}

if (!satisfiesRange(nvmrcVersion, rootPackage.engines.node)) {
  fail(
    `.nvmrc ${nvmrcVersion.raw} does not satisfy ${rootPackage.engines.node}`
  );
}

if (dockerNodeImageMatches.length === 0) {
  fail("Dockerfile must use explicit node:<version> base images");
}

for (const match of dockerNodeImageMatches) {
  const dockerImageTag = match[1];
  const dockerNodeVersion = parseVersion(
    dockerImageTag.split("@")[0].split("-")[0]
  );

  if (compareVersions(dockerNodeVersion, nvmrcVersion) !== 0) {
    fail(
      `Dockerfile node:${dockerImageTag} does not match .nvmrc ${nvmrcVersion.raw}`
    );
  }
}

const dockerRunLines = dockerfileLines
  .map((line, index) => ({ lineNumber: index + 1, text: line }))
  .filter((line) => /^\s*RUN\b/.test(line.text));
const dockerNpmCiLines = dockerRunLines.filter((line) =>
  /\bnpm\s+ci\b/.test(line.text)
);

if (dockerNpmCiLines.length === 0) {
  fail("Dockerfile must install Node dependencies with npm ci");
}

for (const line of dockerNpmCiLines) {
  if (!/\s--ignore-scripts(?:\s|$)/.test(line.text)) {
    fail(
      `Dockerfile:${line.lineNumber} npm ci must use --ignore-scripts; run generated-artifact steps explicitly`
    );
  }
}

if (!dockerRunLines.some((line) => /\bnpm\s+run\s+build\b/.test(line.text))) {
  fail("Dockerfile must run npm run build after installing root dependencies");
}

if (
  !dockerRunLines.some(
    (line) =>
      line.text.includes("script/coin-price-data-fetcher") &&
      /\bnpm\s+run\s+flow-remove-types\b/.test(line.text)
  )
) {
  fail(
    "Dockerfile must run coin-price-data-fetcher flow-remove-types after installing dependencies"
  );
}

let setupNodeBlockCount = 0;

for (const workflowFile of workflowFiles) {
  const workflowPath = path.join(workflowDir, workflowFile);
  const setupNodeBlocks = getSetupNodeBlocks(readFile(workflowPath));
  setupNodeBlockCount += setupNodeBlocks.length;

  for (const block of setupNodeBlocks) {
    const workflowLocation = `.github/workflows/${workflowFile}:${block.lineNumber}`;

    if (/^\s*node-version\s*:/m.test(block.text)) {
      fail(
        `${workflowLocation} must not set node-version separately from .nvmrc`
      );
    }

    if (!/^\s*node-version-file:\s*["']?\.nvmrc["']?\s*$/m.test(block.text)) {
      fail(`${workflowLocation} must use node-version-file: ".nvmrc"`);
    }
  }
}

if (setupNodeBlockCount === 0) {
  fail('GitHub workflows must use actions/setup-node with ".nvmrc"');
}

for (const packageRoot of packageRoots) {
  const pkg = readJson(path.join(packageRoot.dir, "package.json"));
  const lockfile = readJson(path.join(packageRoot.dir, "package-lock.json"));
  const lockedRootPackage = lockfile.packages && lockfile.packages[""];
  const npmrc = readNpmrc(packageRoot.dir);

  if (lockfile.lockfileVersion !== 3) {
    fail(
      `${packageRoot.name} package-lock.json must use lockfileVersion 3 for npm 10`
    );
  }

  if (!lockedRootPackage) {
    fail(`${packageRoot.name} package-lock.json must include packages[""]`);
  } else {
    if (lockfile.name !== pkg.name || lockedRootPackage.name !== pkg.name) {
      fail(
        `${packageRoot.name} package-lock.json name must match package.json`
      );
    }

    if (
      lockfile.version !== pkg.version ||
      lockedRootPackage.version !== pkg.version
    ) {
      fail(
        `${packageRoot.name} package-lock.json version must match package.json`
      );
    }

    for (const key of ["dependencies", "devDependencies", "engines"]) {
      if (stableJson(lockedRootPackage[key]) !== stableJson(pkg[key])) {
        fail(
          `${packageRoot.name} package-lock.json ${key} must match package.json`
        );
      }
    }
  }

  if (pkg.engines.node !== rootPackage.engines.node) {
    fail(
      `${packageRoot.name} node engine ${pkg.engines.node} does not match root ${rootPackage.engines.node}`
    );
  }

  if (pkg.engines.npm !== rootPackage.engines.npm) {
    fail(
      `${packageRoot.name} npm engine ${pkg.engines.npm} does not match root ${rootPackage.engines.npm}`
    );
  }

  if (pkg.packageManager !== rootPackage.packageManager) {
    fail(
      `${packageRoot.name} packageManager ${pkg.packageManager} does not match root ${rootPackage.packageManager}`
    );
  }

  if (npmrc.get("engine-strict") !== "true") {
    fail(`${packageRoot.name} .npmrc must set engine-strict=true`);
  }

  if (!satisfiesRange(currentNodeVersion, pkg.engines.node)) {
    fail(
      `current Node ${currentNodeVersion.raw} does not satisfy ${packageRoot.name} engine ${pkg.engines.node}`
    );
  }

  if (!satisfiesRange(currentNpmVersion, pkg.engines.npm)) {
    fail(
      `current npm ${currentNpmVersion.raw} does not satisfy ${packageRoot.name} engine ${pkg.engines.npm}`
    );
  }
}

if (failures.length > 0) {
  console.error("Toolchain check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Toolchain OK: Node ${process.version}, npm ${currentNpmVersion.raw}, engine-strict enabled for ${packageRoots.length} package roots, Docker Node image and GitHub Actions Node setup aligned with .nvmrc.`
);
