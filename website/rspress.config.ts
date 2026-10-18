import { fileURLToPath } from "node:url";
import { defineConfig } from "@rspress/core";
import { pluginSitemap } from "@rspress/plugin-sitemap";
import { base, siteUrl, repository, version } from "./site";

const chineseNavigation = {
    nav: [
      { text: "开始使用", link: "/guide/quick-start", activeMatch: "^/guide/" },
      { text: "接入方式", link: "/integrations/index", activeMatch: "^/integrations/" },
      { text: "参考", link: "/api/intent", activeMatch: "^/api/" },
      { text: "示例", link: "/examples/index", activeMatch: "^/examples/" },
    ],
    sidebar: {
      '/': [
        {text: '开始使用', items: [
          {text: '项目定位', link: '/guide/introduction'},
          {text: '安装与版本', link: '/guide/installation'},
          {text: '快速开始', link: '/guide/quick-start'},
        ]},
        {text: '使用指南', items: [
          {text: '如何读取结果', link: '/guide/results'},
          {text: '提取字段与订单号', link: '/guide/fields'},
          {text: '多轮识别与旧值失效', link: '/guide/multi-turn'},
        ]},
        {text: '接入方式', items: [
          {text: '选择接入方式', link: '/integrations/index'},
          {text: '模型 API 与自有网关', link: '/integrations/api'},
          {text: '接入 Codex', link: '/integrations/codex'},
          {text: 'MCP 接入与使用', link: '/integrations/mcp'},
          {text: '给已有 MCP 添加工具', link: '/integrations/mcp-sdk'},
        ]},
        {text: '参考', items: [
          {text: '配置参考', link: '/guide/configuration'},
          {text: 'Native API', link: '/api/intent'},
          {text: '完整响应', link: '/api/response'},
          {text: '完整 TypeScript 类型', link: '/api/types'},
          {text: 'Schema 支持范围', link: '/api/schema'},
          {text: 'MCP 工具与协议', link: '/api/mcp'},
          {text: '错误与恢复', link: '/api/errors'},
        ]},
        {text: '运维与支持', items: [
          {text: 'Codex 安装维护', link: '/operations/codex'},
          {text: '场景示例', link: '/examples/index'},
          {text: '兼容与支持', link: '/testing/validation'},
        ]},
      ],
    },
};
const englishNavigation = {
    nav: [
      { text: "Get started", link: "/guide/quick-start", activeMatch: "^/guide/" },
      { text: "Integrations", link: "/integrations/index", activeMatch: "^/integrations/" },
      { text: "Reference", link: "/api/intent", activeMatch: "^/api/" },
      { text: "Examples", link: "/examples/index", activeMatch: "^/examples/" },
    ],
    sidebar: {
      '/': [
        {text: 'Get started', items: [
          {text: 'Introduction', link: '/guide/introduction'},
          {text: 'Installation', link: '/guide/installation'},
          {text: 'Quick start', link: '/guide/quick-start'},
        ]},
        {text: 'Guides', items: [
          {text: 'Read the result', link: '/guide/results'},
          {text: 'Extract fields', link: '/guide/fields'},
          {text: 'Multi-turn changes', link: '/guide/multi-turn'},
        ]},
        {text: 'Integrations', items: [
          {text: 'Choose an integration', link: '/integrations/index'},
          {text: 'Model APIs & gateways', link: '/integrations/api'},
          {text: 'Connect Codex', link: '/integrations/codex'},
          {text: 'Connect MCP clients', link: '/integrations/mcp'},
          {text: 'Extend an MCP server', link: '/integrations/mcp-sdk'},
        ]},
        {text: 'Reference', items: [
          {text: 'Configuration', link: '/guide/configuration'},
          {text: 'Native API', link: '/api/intent'},
          {text: 'Response reference', link: '/api/response'},
          {text: 'TypeScript types', link: '/api/types'},
          {text: 'Schema support', link: '/api/schema'},
          {text: 'MCP tools & protocol', link: '/api/mcp'},
          {text: 'Errors & recovery', link: '/api/errors'},
        ]},
        {text: 'Operations & support', items: [
          {text: 'Maintain Codex setup', link: '/operations/codex'},
          {text: 'Usage examples', link: '/examples/index'},
          {text: 'Compatibility & support', link: '/testing/validation'},
        ]},
      ],
    },
};

const locales = [
    {lang: "en", label: "English", title: "intent-runtime", description: "Structure user intent, preserve constraints, and extract schema-defined data for Node.js and MCP.", ...englishNavigation},
    {lang: "zh", label: "简体中文", title: "intent-runtime", description: "识别当前请求、保留约束并按 Schema 提取业务字段。", ...chineseNavigation},
  ];

function localizedUrl(route: {pureRoutePath: string}, lang: string) {
  const page = route.pureRoutePath.replace(/^\//, '').replace(/\.html$/, '').replace(/\/$/, '/index');
  return `${siteUrl}/${lang === 'zh' ? 'zh/' : ''}${!page || page === 'index' ? '' : page + '.html'}`;
}

export default defineConfig({
  root: fileURLToPath(new URL("./content", import.meta.url)),
  base,
  siteOrigin: new URL(siteUrl).origin,
  outDir: process.env.INTENT_DOCS_DIR ?? "dist",
  lang: "en",
  route: {localeRedirect: "never"},
  locales,
  globalStyles: fileURLToPath(new URL("./theme/index.css", import.meta.url)),
  themeDir: fileURLToPath(new URL("./theme", import.meta.url)),
  title: "intent-runtime",
  description: "Structure user intent, preserve constraints, and extract schema-defined data for Node.js and MCP.",
  logo: "/logo.svg",
  logoText: "intent-runtime",
  icon: "/favicon.svg",
  plugins: [pluginSitemap({ siteUrl })],
  search: { codeBlocks: true, searchHooks: fileURLToPath(new URL('./theme/search.tsx', import.meta.url)) },
  head: [
    route => route.pureRoutePath.includes('404') ? undefined : ["link", {rel: "canonical", href: localizedUrl(route, route.lang)}],
    route => route.pureRoutePath.includes('404') ? undefined : ["link", {rel: "alternate", hreflang: "x-default", href: localizedUrl(route, "en")}],
    ["meta", { property: "og:type", content: "website" }],
    route => ["meta", {property: "og:locale", content: route.lang === "zh" ? "zh_CN" : "en_US"}],
    route => ["meta", {property: "og:title", content: route.lang === "zh" ? "intent-runtime · 中文文档" : "intent-runtime · Documentation"}],
    route => ["meta", {property: "og:description", content: route.lang === "zh" ? "识别当前请求、保留约束并按 Schema 提取业务字段。" : "Goals, constraints and changes in one structured result for your application."}],
    route => ["meta", {property: "og:image", content: `${siteUrl}/og-card${route.lang === "zh" ? "-zh" : ""}.svg`}],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
  ],
  themeConfig: {
    locales,
    lastUpdated: true,
    editLink: { docRepoBaseUrl: `${repository}/blob/main/website/content` },
    socialLinks: [{ icon: "github", mode: "link", content: repository }],
    footer: { message: `${version} · MIT License · devcodex-labs` },
  },
});
