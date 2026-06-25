const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const frontendDir = path.resolve(__dirname, "..");
const sourcePath = path.resolve(frontendDir, "..", "ontology.yaml");
const outputDir = path.resolve(frontendDir, "generated");
const outputPath = path.resolve(outputDir, "ontology.json");

const source = fs.readFileSync(sourcePath, "utf8");
const document = YAML.parse(source);
if (!document || typeof document !== "object" || !document.units || typeof document.units !== "object") {
  throw new Error("ontology.yaml must define a units mapping");
}

const generated = {
  generated_from: "../ontology.yaml",
  version: String(document.version || "unknown"),
  domain: String(document.domain || "unknown"),
  units: document.units
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(generated, null, 2)}\n`, "utf8");
console.log(`Generated ${path.relative(frontendDir, outputPath)} from ${path.relative(frontendDir, sourcePath)}`);
