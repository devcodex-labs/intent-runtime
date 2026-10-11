import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const website = fileURLToPath(new URL("../", import.meta.url));
const content = join(website, "content");
const metadata = JSON.parse(await readFile(join(website, "../package.json"), "utf8"));
const site = "https://devcodex-labs.github.io/intent-runtime";
async function pages(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "public") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await pages(path));
    else if (/\.mdx?$/.test(entry.name)) result.push(path);
  }
  return result;
}
const lines = ["# intent-runtime", "", `> 中文文档 · v${metadata.version.split("-")[0]}。面向应用与 AI 客户端的大模型意图结构化与业务字段提取组件。`, "",
  "库运行时 Node.js ≥20.0.0；MCP 使用当前宿主模型，应用调用使用显式配置的 OpenAI/xAI 或自定义 ModelExecutor。context 可选且由调用方提供；模块不收集历史、不推断实施步骤或所需业务能力、不执行业务动作。默认无模块解析总时限，识别任务默认不按时间过期，但依赖原连接和进程。ready 不代替授权，结构与来源校验不证明真实语义准确率。", "", "## 中文页面", ""];
for (const path of await pages(content)) {
  const source = await readFile(path, "utf8");
  const title = /^title: (.+)$/m.exec(source)?.[1];
  const description = /^description: (.+)$/m.exec(source)?.[1];
  if (!title || !description) throw new Error(`Missing metadata: ${path}`);
  const name = relative(content, path).replaceAll("\\", "/").replace(/\.mdx?$/, "");
  const url = name === "index" ? `${site}/` : `${site}/${name}.html`;
  lines.push(`- [${title}](${url}): ${description}`);
}
await writeFile(join(website, "dist/llms.txt"), lines.join("\n") + "\n");
console.log(`Generated Chinese llms.txt from ${lines.filter(line => line.startsWith("- [")).length} pages.`);
