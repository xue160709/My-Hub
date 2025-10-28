## AI Bookmark · Browser Extension (Vite + React + TS + Tailwind)

一款用 AI 增强历史与书签管理体验的浏览器扩展：统一搜索（历史 + 书签 + 标签）、高效的组织与批量操作，并支持本地 Gemini Nano 与云端 LLM 的自动整理功能。

### 主要特性

- 统一搜索：在首页实现“全局搜索”，并行检索浏览历史与书签（含标签），结果合并展示。
- 收藏增强：为书签引入标签系统（IndexedDB 存储），支持批量移动、加标签、删除与文件夹管理。
- 历史视图：时间分组、日期/小时导航、无限滚动、跨设备筛选、批量删除、CSV/HTML 导出。
- AI 自动整理：调用 Gemini Nano 或云端 LLM，为书签生成新的文件夹结构，预览后可一键应用。
- 新标签页覆盖：自定义 `New Tab` 页（首页/历史/收藏/设置）。
- 多浏览器构建：区分 Chrome（MV3 service worker）与 Firefox（脚本后台）输出目录。

### 技术栈

- 构建：Vite 6、`@crxjs/vite-plugin`
- 前端：React 19、TypeScript 5、Tailwind CSS 4
- API：`chrome.bookmarks`、`chrome.history`、`chrome.sessions`
- 存储：IndexedDB（标签）、localStorage（LLM 设置）

### 目录结构（部分）

```text
src/
  pages/
    background/              # 后台脚本（事件与同步）
    newtab/                  # 新标签页（首页/历史/收藏/设置）
    popup/                   # 快捷添加书签弹窗
    options/                 # 扩展设置页
  components/                # 通用 UI 组件（搜索框、选择栏、树等）
  services/                  # 业务服务（llmService 等）
  lib/                       # 工具与提示词（llmUtils、prompts）
  db/                        # IndexedDB 读写（bookmark_tags）
  data/                      # 模型与服务商清单（PROVIDERS）
```

### 脚本命令

```bash
# 开发（Chrome）
npm run dev           # 或 npm run dev:chrome

# 开发（Firefox）
npm run dev:firefox

# 构建产物
npm run build         # 等价于 build:chrome
npm run build:chrome
npm run build:firefox
```

开发模式下，构建产物输出至 `dist_chrome/` 或 `dist_firefox/`；在浏览器扩展管理页选择“加载已解压的扩展”，分别指向对应目录即可热更新调试。

### 加载与调试

1. 运行开发脚本（见上）。
2. Chrome 打开 `chrome://extensions`，开启“开发者模式”，点击“加载已解压的扩展”，选择项目下的 `dist_chrome/`。
3. Firefox 打开 `about:debugging#/runtime/this-firefox`，选择“临时加载附加组件”，选择 `dist_firefox/manifest.json`。

### 权限说明（manifest）

- `history`：用于检索与删除历史记录。
- `bookmarks`：用于读取、创建、移动与删除书签与文件夹。
- `sessions`：跨设备/会话信息（历史页筛选）。
- `storage`：存储用户偏好（如排序）与配置（LLM 设置保存在 localStorage）。
- `activeTab`、`clipboardRead`：用于部分交互能力与内容脚本。

### LLM 设置与使用

- 入口：新标签页的“设置” → “LLM 设置”。
- 本地优先：可勾选“优先使用 Gemini Nano（Prompt API）”，在支持设备上本地推理；若不可用则自动回退云端。
- 云端服务商：内置 `SiliconFlow`、`OpenRouter`，或选择“自定义”（自定义 Base URL/模型）。
- 测试连接：保存前可“测试连接”，校验 API Key、URL、模型是否可用。
- 调用方式：统一由 `src/services/llmService.ts` 的 `sendMessage` 处理，支持流式/非流式两种模式；非流式常用于需要完整 JSON 的场景（如自动整理）。

提示：LLM 配置持久化在浏览器 localStorage，仅用于客户端侧调用；请妥善保管密钥，生产环境建议使用具有额度与权限隔离的密钥。

### IndexedDB（书签标签）

- DB：`ChromeHistoryDB`，Store：`bookmark_tags`，主键：`url`
- 能力：批量更新/删除、全量清空、按 URL 读写
- 映射维护：后台脚本维护 `id → url` 映射，处理 URL 变更与文件夹递归删除时的数据迁移与清理。

### 统一搜索（Global/Home）

- Hook：`src/hooks/useGlobalSearch.ts`
- 策略：并行查询 `chrome.history.search` 与本地书签（含标签），合并结果并轻量排序，保证输入时的实时反馈。

### 构建配置

- 基础：`vite.config.base.ts`（React/Tailwind/路径别名、本地化开关）
- Chrome：`vite.config.chrome.ts`（MV3 service worker）、输出 `dist_chrome/`
- Firefox：`vite.config.firefox.ts`（脚本后台）、输出 `dist_firefox/`
- 可选本地化：`src/locales`，将 `vite.config.base.ts` 中 `localize` 置为 `true` 可启用。

### 常见问题（FAQ）

- Gemini Nano 提示不可用：确认 Chrome 是否支持 Prompt API，或暂时关闭“优先使用 Gemini Nano”改用云端。
- 云端 SSE 流式解析失败：检查 Base URL、模型与 API Key 是否匹配，或关闭“流式”改为非流式获取完整内容。
- Firefox 调试：本仓库为 MV3 定制，Firefox 端使用脚本后台；如遇兼容性问题请优先在 Chrome 验证逻辑。

### 贡献与规范

- TypeScript 强类型、避免 `any`；控制流采用早返回，尽量浅层嵌套。
- 提交前建议运行 ESLint；保持文件风格与现有代码一致。

### 许可与致谢

- 许可：MIT（见 `LICENSE`）。
- 致谢：项目起源于 `vite-web-extension` 模板，并基于其进行大量功能扩展与重构。


