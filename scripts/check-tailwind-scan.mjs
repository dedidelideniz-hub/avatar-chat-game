/**
 * Tailwind içerik taraması doğrulaması.
 *
 * Vite ile aynı yolu izler: `@tailwindcss/vite` eklentisi CSS üretirken
 *   sources = [compiler.root ?? { base: projectRoot, pattern: glob-all }] + compiler.sources
 * listesiyle `@tailwindcss/oxide` Scanner'ını kurar, adayları toplayıp CSS'i derler.
 *
 * Kullanım (bellek sınırı koyarak, OOM'da zarar vermesin diye):
 *   node --max-old-space-size=900 scripts/check-tailwind-scan.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { compile } from "@tailwindcss/node";
import { Scanner as OxideScanner } from "@tailwindcss/oxide";

const root = process.cwd();
const cssPath = path.join(root, "src/index.css");

// Ağa çıkmasın diye harici font @import'u çıkarılır (tarama mantığını etkilemez).
const css = fs
  .readFileSync(cssPath, "utf8")
  .replace(/^@import url\([^)]*\);\s*$/gm, "");

const mb = (bytes) => `${(bytes / 1048576).toFixed(0)}MB`;

const compiler = await compile(css, {
  base: path.dirname(cssPath),
  shouldRewriteUrls: true,
  onDependency: () => {},
});

const sources =
  compiler.root === "none"
    ? []
    : compiler.root === null
      ? [{ base: root, pattern: "**/*", negated: false }]
      : [{ ...compiler.root, negated: false }];

const allSources = sources.concat(compiler.sources);
console.log(`compiler.root: ${JSON.stringify(compiler.root)}`);
console.log(`scanner kaynakları (${allSources.length}):`);
for (const entry of allSources) {
  console.log(
    `   ${entry.negated ? "HARİÇ " : "dahil "} ${JSON.stringify(entry.pattern)}  (base: ${path.relative(root, entry.base) || "."})`,
  );
}

const scanner = new OxideScanner({ sources: allSources });
const files = scanner.files ?? [];
let bytes = 0;
for (const file of files) {
  try {
    bytes += fs.statSync(file).size;
  } catch {}
}
console.log(`\ntaranan dosya: ${files.length} | toplam: ${mb(bytes)}`);

const candidates = [];
for (const candidate of scanner.scan()) candidates.push(candidate);
console.log(
  `aday: ${candidates.length} | süre sonrası rss: ${mb(process.memoryUsage().rss)} | heapUsed: ${mb(process.memoryUsage().heapUsed)}`,
);

const output = compiler.build(candidates);
console.log(`\nüretilen CSS: ${(output.length / 1024).toFixed(0)} KB`);

// Gerçekten sınıf üretiliyor mu? (tarama çalışıyor kanıtı)
for (const probe of [".flex", ".grid", "--color-background"]) {
  console.log(`   ${probe} stdout: ${output.includes(probe) ? "VAR" : "YOK"}`);
}
