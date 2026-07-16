const assert = require("node:assert/strict");
const test = require("node:test");
const {
  getDockerRunInstructions,
  hasNpmCommandFlag,
} = require("./docker-command-policy");

const npmCiPolicyPasses = (dockerfile) => {
  const instructions = getDockerRunInstructions(dockerfile).filter(
    (instruction) => /\bnpm\s+ci\b/.test(instruction.text)
  );

  return (
    instructions.length > 0 &&
    instructions.every((instruction) =>
      hasNpmCommandFlag(instruction, "ci", "--ignore-scripts")
    )
  );
};

test("accepts every npm ci segment when each uses --ignore-scripts", () => {
  assert.equal(
    npmCiPolicyPasses("RUN npm ci --ignore-scripts && npm ci --ignore-scripts"),
    true
  );
});

for (const separator of ["&&", "||", ";", "&"]) {
  test(`rejects an unguarded npm ci segment after ${separator}`, () => {
    assert.equal(
      npmCiPolicyPasses(`RUN npm ci --ignore-scripts ${separator} npm ci`),
      false
    );
  });
}

test("folds Docker continuations before checking npm ci segments", () => {
  const dockerfile = [
    "FROM node:22.23.1-alpine",
    "RUN npm ci --ignore-scripts \\",
    "    && npm ci",
  ].join("\n");
  const instructions = getDockerRunInstructions(dockerfile);

  assert.deepEqual(instructions, [
    {
      lineNumber: 2,
      text: "RUN npm ci --ignore-scripts  && npm ci",
    },
  ]);
  assert.equal(npmCiPolicyPasses(dockerfile), false);
});
