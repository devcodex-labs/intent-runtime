import { fileURLToPath } from "node:url";
import { defineConfig } from "@rspress/core";
import { pluginSitemap } from "@rspress/plugin-sitemap";
import { base, siteUrl, repository, version } from "./site";

export default defineConfig({
  root: fileURLToPath(new URL("./content", import.meta.url)),
  base,
  outDir: "dist",
  lang: "zh",
  title: "intent-runtime",
  description: "从当前有效请求到结构化意图，使用 schema-dsl 提取可验证的业务字段。",
  logo: "/logo.svg",
  logoText: "intent-runtime",
  icon: "/favicon.svg",
  plugins: [pluginSitemap({ siteUrl })],
  search: { codeBlocks: true },
  head: [
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "intent-runtime · 中文文档" }],
    ["meta", { property: "og:description", content: "识别当前有效请求，保留约束与来源，连接 Codex 和模型 API。" }],
    ["meta", { property: "og:image", content: `${siteUrl}/og-card.svg` }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
  ],
  themeConfig: {
    lastUpdated: true,
    editLink: { docRepoBaseUrl: `${repository}/blob/main/website/content` },
    nav: [
      { text: "指南", link: "/guide/introduction", activeMatch: "^/guide/" },
      { text: "集成", link: "/integrations/codex-cli", activeMatch: "^/integrations/" },
      { text: "API 参考", link: "/api/intent", activeMatch: "^/api/" },
      { text: "示例", link: "/examples/orders", activeMatch: "^/examples/" },
      { text: "测试与兼容", link: "/testing/validation", activeMatch: "^/testing/" },
      { text: `v${version}`, link: `${repository}/blob/main/CHANGELOG.md` },
    ],
    sidebar: {
      "/": [
        { text: "开始使用", items: [
          { text: "介绍", link: "/guide/introduction" },
          { text: "快速开始", link: "/guide/quick-start" },
          { text: "安装与维护", link: "/guide/installation" },
          { text: "配置与多实例", link: "/guide/configuration" },
        ] },
        { text: "理解结果", items: [
          { text: "意图契约", link: "/guide/intent-contract" },
          { text: "Schema 与字段选择", link: "/guide/schema-fields" },
          { text: "任务与生命周期", link: "/guide/lifecycle" },
        ] },
        { text: "接入模型", items: [
          { text: "Codex CLI", link: "/integrations/codex-cli" },
          { text: "Codex Desktop", link: "/integrations/codex-desktop" },
          { text: "OpenAI 与 xAI", link: "/integrations/openai-xai" },
        ] },
        { text: "API 参考", items: [
          { text: "Intent 与执行器", link: "/api/intent" },
          { text: "Bridge 与 MCP", link: "/api/bridge-mcp" },
          { text: "错误与部分结果", link: "/api/errors" },
        ] },
        { text: "示例与验证", items: [
          { text: "订单字段提取", link: "/examples/orders" },
          { text: "上下文与字段选择", link: "/examples/context-fields" },
          { text: "测试、兼容与准确率", link: "/testing/validation" },
        ] },
      ],
    },
    socialLinks: [{ icon: "github", mode: "link", content: repository }],
    footer: { message: "MIT License · devcodex-labs" },
  },
});
