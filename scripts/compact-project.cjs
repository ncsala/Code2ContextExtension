#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const ig = require("ignore")();

const ROOT_DIR = __dirname;
const OUTPUT = path.join(ROOT_DIR, "combined.txt");
const IGN_FILES = [".llmignore", ".gitignore"];

// Carga reglas de ignore
for (const name of IGN_FILES) {
  const file = path.join(ROOT_DIR, name);
  if (fs.existsSync(file)) {
    ig.add(fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean));
    break;
  }
}
ig.add(["node_modules", ".git", "*.lock", "*.log"]);

// Marcadores LLM
const TREE = "@Tree:";
const INDEX = "@Index:";
const FILE = "@F:";
let fileIndex = 0;
const toc = [];
const treeLines = [];

function shouldSkip(rel) {
  return ig.ignores(rel);
}
function minify(content) {
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
}

function walk(dir, prefix = "") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach((ent, i) => {
    const abs = path.join(dir, ent.name);
    const rel = path.relative(ROOT_DIR, abs).replace(/\\/g, "/");
    if (shouldSkip(rel)) return;
    const last = i === entries.length - 1;
    treeLines.push(`${prefix}${last ? "`-- " : "|-- "}${ent.name}`);
    if (ent.isDirectory()) walk(abs, prefix + (last ? "    " : "|   "));
    else {
      fileIndex++;
      toc.push({ idx: fileIndex, rel });
      const raw = fs.readFileSync(abs, "utf8");
      fs.appendFileSync(OUTPUT, `${FILE}|${fileIndex}|${rel}|${minify(raw)}\n`);
    }
  });
}

// Inicia output
if (fs.existsSync(OUTPUT)) fs.unlinkSync(OUTPUT);
fs.writeFileSync(
  OUTPUT,
  `// Conventions:\n` +
    `// ${TREE} project directory structure\n` +
    `// ${INDEX} table of contents\n` +
    `// ${FILE} index|path|minifiedContent\n\n`
);
walk(ROOT_DIR);
const header =
  `${TREE}\n${treeLines.join("\n")}\n\n${INDEX}\n` +
  toc.map((t) => `${t.idx}|${t.rel}`).join("\n") +
  `\n\n`;
const old = fs.readFileSync(OUTPUT);
fs.writeFileSync(OUTPUT, header);
fs.appendFileSync(OUTPUT, old);
console.log(`✅ created ${OUTPUT} with ${fileIndex} files`);
