import ts from "typescript";
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

function emit(directory = "src") {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) emit(file);
    else if (entry.name.endsWith(".ts")) {
      const output = join("dist", file.slice(4).replace(/\.ts$/, ".js"));
      const result = ts.transpileModule(readFileSync(file, "utf8"), {
        fileName: file,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
          rewriteRelativeImportExtensions: true, isolatedModules: true },
      });
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, result.outputText);
    }
  }
}
emit();
console.log("Usuarios: módulos ESM emitidos en dist/.");
