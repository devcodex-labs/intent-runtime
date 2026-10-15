import { fileURLToPath } from "node:url";
import { defineConfig } from "@rspress/core";
import { pluginSitemap } from "@rspress/plugin-sitemap";
import { base, siteUrl, repository, version } from "./site";

export default defineConfig({
  root: fileURLToPath(new URL("./content", import.meta.url)),
  base,
  outDir: process.env.INTENT_DOCS_DIR ?? "dist",
  lang: "zh",
  globalStyles: fileURLToPath(new URL("./theme/index.css", import.meta.url)),
  themeDir: fileURLToPath(new URL("./theme", import.meta.url)),
  title: "intent-runtime",
  description: "面向应用与 AI 客户端的大模型意图结构化组件，识别当前请求、保留约束并按 Schema 提取业务字段。",
  logo: "/logo.svg",
  logoText: "intent-runtime",
  icon: "/favicon.svg",
  plugins: [pluginSitemap({ siteUrl })],
  search: { codeBlocks: true },
  head: [
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "intent-runtime · 中文文档" }],
    ["meta", { property: "og:description", content: "识别当前请求、保留动作与约束、按 Schema 提取业务字段，为应用和 AI 客户端交付统一的理解结果。" }],
    ["meta", { property: "og:image", content: `${siteUrl}/og-card.svg` }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
  ],
  themeConfig: {
    lastUpdated: true,
    editLink: { docRepoBaseUrl: `${repository}/blob/main/website/content` },
    nav: [
      { text: "开始使用", link: "/guide/quick-start", activeMatch: "^/guide/" },
      { text: "接入方式", link: "/integrations/index", activeMatch: "^/integrations/" },
      { text: "API 参考", link: "/api/intent", activeMatch: "^/api/" },
      { text: "示例", link: "/examples/index", activeMatch: "^/examples/" },
      { text: "兼容与支持", link: "/testing/validation", activeMatch: "^/testing/" },
      { text: "更新日志", link: `${repository}/blob/main/CHANGELOG.md` },
    ],
    sidebar: {
      '/': [
        {text: '开始使用', items: [
          {text: '项目定位', link: '/guide/introduction'},
          {text: '快速开始', link: '/guide/quick-start'},
          {text: '安装与版本', link: '/guide/installation'},
          {text: '如何读取结果', link: '/guide/results'},
          {text: '配置参考', link: '/guide/configuration'},
          {text: 'Schema 与多轮字段', link: '/guide/fields'},
          {text: '多轮对话与结果消费', link: '/guide/multi-turn'},
        ]},
        {text: 'API 与接入', items: [
          {text: '选择接入方式', link: '/integrations/index'},
          {text: 'Native API', link: '/api/intent'},
          {text: '完整响应', link: '/api/response'},
          {text: '完整 TypeScript 类型', link: '/api/types'},
          {text: '错误与恢复', link: '/api/errors'},
          {text: 'Responses API', link: '/integrations/api'},
          {text: '标准 MCP tools', link: '/integrations/mcp'},
          {text: 'Codex 与 stdio', link: '/integrations/codex'},
        ]},
        {text: '使用与验证', items: [
          {text: '场景示例', link: '/examples/index'},
          {text: '兼容与支持', link: '/testing/validation'},
        ]},
      ],
    },
    socialLinks: [{ icon: "github", mode: "link", content: repository }],
    footer: { message: `适用包版本 ${version} · MIT License · devcodex-labs` },
  },
});
