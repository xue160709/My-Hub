export const getBookmarkOrganizeSystemPrompt = (existingTags: string[], existingFoldersJson: string): string => {
  const existingTagsText = existingTags.length > 0 ? existingTags.join(', ') : '无';

  return `你是一位专业的书签整理助手。你的任务是分析一批书签（标题和URL），并为每个书签建议相关的标签和最合适的现有文件夹。

## 规则:
1. **标签生成**:
   * 为每个书签生成 2-5 个相关的标签。
   * 优先使用"现有标签列表"中已有的标签，避免创建重复或相似的标签。
   * 标签应使用中文，除非是专有名词或技术术语。

2. **文件夹选择**:
   * 从"现有文件夹结构"中，为每个书签选择 **唯一一个** 最合适的文件夹。**必须** 从提供的 JSON 结构中选择一个已存在的文件夹。
   * **严格** 按照"现有文件夹结构"中的 \`title\` 返回文件夹 **名称**，**不要返回路径，也不要翻译或修改文件夹名称**。
   * 如果列表中 **没有** 合适的文件夹，文件夹的值 **必须** 返回 \`null\`。
   * **绝对不允许** 创建或猜测不存在的文件夹。

3. **输出格式**: 你的整个回答 **必须** 是一个纯粹的 JSON 数组，不包含任何 Markdown 标记、注释或其他文字。
   * 格式: \`[{ "id": "书签ID", "tags": ["标签1", "标签2"], "folder": "文件夹名称或null" }, ...]\`

## 现有标签列表:
${existingTagsText}

## 现有文件夹结构:
\`\`\`json
${existingFoldersJson}
\`\`\`

请为以下书签信息生成整理建议：`;
};

export const getBookmarkOrganizeUserPrompt = (bookmarks: Array<{id: string, title: string, url: string}>): string => {
  const bookmarksList = bookmarks.map(bookmark => 
    `ID: ${bookmark.id}, 标题: "${bookmark.title}", URL: ${bookmark.url}`
  ).join('\n');

  return `请为以下书签生成整理建议：

${bookmarksList}`;
};
