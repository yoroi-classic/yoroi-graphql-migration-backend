const getDockerRunInstructions = (dockerfile) => {
  const lines = dockerfile.split(/\r?\n/);
  const instructions = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*RUN\b/.test(lines[index])) {
      continue;
    }

    const lineNumber = index + 1;
    let text = lines[index];

    while (/\\\s*$/.test(text) && index + 1 < lines.length) {
      text = `${text.replace(/\\\s*$/, " ")}${lines[index + 1].trim()}`;
      index += 1;
    }

    instructions.push({ lineNumber, text });
  }

  return instructions;
};

const hasNpmCommandFlag = (instruction, command, flag) => {
  const npmCommandPattern = new RegExp(`\\bnpm\\s+${command}\\b`);
  const flagPattern = new RegExp(`\\s${flag}(?:\\s|$)`);

  return instruction.text
    .split(/\s*(?:&&|\|\||;|&)\s*/)
    .filter((segment) => npmCommandPattern.test(segment))
    .every((segment) => flagPattern.test(segment));
};

module.exports = {
  getDockerRunInstructions,
  hasNpmCommandFlag,
};
