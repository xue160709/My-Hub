import { EnhancedBookmark } from '../types/bookmarks';
import { sendMessage } from './llmService';
import { extractJsonString } from '../lib/llmUtils';
import { getBookmarkOrganizeSystemPrompt, getBookmarkOrganizeUserPrompt } from '../lib/bookmarkOrganizePrompts';
import { getAllBookmarkTags, batchUpdateTags } from '../db/indexedDB';
import { BookmarkOrganization } from '../types/bookmarks';

export interface OrganizeResult {
  id: string;
  tags: string[];
  folder: string | null;
}

export interface OrganizeProgress {
  currentBatch: number;
  totalBatches: number;
  processedCount: number;
  totalCount: number;
  currentStatus: string;
}

export type OrganizeProgressCallback = (progress: OrganizeProgress) => void;

/**
 * 获取根目录中的书签（只包含直接在根目录中的书签，不包括子文件夹中的）
 */
export const getRootBookmarks = (bookmarks: EnhancedBookmark[]): EnhancedBookmark[] => {
  console.log('[BookmarkOrganizeService] 开始提取根目录书签');
  
  const rootBookmarks: EnhancedBookmark[] = [];
  
  // 顶级书签数组通常包含“书签栏”（id '1'）和“其他书签”（id '2'）
  for (const topLevelFolder of bookmarks) {
    if (topLevelFolder.children) {
      for (const node of topLevelFolder.children) {
        // 我们只想要顶级文件夹正下方的书签（带有URL）。
        if (node.url) {
          rootBookmarks.push(node);
          console.log('[BookmarkOrganizeService] 找到根目录书签:', node.title, node.url);
        }
      }
    }
  }
  
  console.log('[BookmarkOrganizeService] 根目录书签提取完成，共', rootBookmarks.length, '个');
  return rootBookmarks;
};

/**
 * 获取所有现有文件夹的结构
 */
export const getFoldersStructure = (bookmarks: EnhancedBookmark[]): any => {
  console.log('[BookmarkOrganizeService] 开始提取文件夹结构');
  
  const extractFolders = (nodes: EnhancedBookmark[]): any[] => {
    const folders: any[] = [];
    
    for (const node of nodes) {
      if (!node.url) {
        // 这是一个文件夹
        const folder = {
          id: node.id,
          title: node.title,
          children: node.children ? extractFolders(node.children) : []
        };
        folders.push(folder);
        console.log('[BookmarkOrganizeService] 找到文件夹:', node.title);
      }
    }
    
    return folders;
  };
  
  const structure = extractFolders(bookmarks);
  console.log('[BookmarkOrganizeService] 文件夹结构提取完成:', JSON.stringify(structure, null, 2));
  return structure;
};

/**
 * 批量整理书签
 */
export const organizeBookmarksBatch = async (
  bookmarks: EnhancedBookmark[],
  allBookmarks: EnhancedBookmark[],
  onProgress: OrganizeProgressCallback,
  onBatchOrganized: (plan: BookmarkOrganization[]) => Promise<void>,
  abortSignal?: AbortSignal
): Promise<void> => {
  console.log('[BookmarkOrganizeService] 开始批量整理书签');
  
  // 获取根目录书签
  const rootBookmarks = getRootBookmarks(bookmarks);
  
  if (rootBookmarks.length === 0) {
    console.log('[BookmarkOrganizeService] 没有找到根目录书签，结束处理');
    onProgress({
      currentBatch: 1,
      totalBatches: 1,
      processedCount: 0,
      totalCount: 0,
      currentStatus: '没有找到需要整理的根目录书签'
    });
    return;
  }
  
  // 获取现有标签和文件夹结构
  const existingTags = await getAllBookmarkTags();
  const allTags = Array.from(new Set(existingTags.flatMap(bt => bt.tags)));
  const foldersStructure = getFoldersStructure(allBookmarks);
  
  console.log('[BookmarkOrganizeService] 现有标签:', allTags);
  console.log('[BookmarkOrganizeService] 文件夹结构:', foldersStructure);
  
  // 分批处理，每批20个
  const batchSize = 20;
  const batches: EnhancedBookmark[][] = [];
  
  for (let i = 0; i < rootBookmarks.length; i += batchSize) {
    batches.push(rootBookmarks.slice(i, i + batchSize));
  }
  
  console.log('[BookmarkOrganizeService] 分批处理，共', batches.length, '批，每批最多', batchSize, '个');
  
  const systemPrompt = getBookmarkOrganizeSystemPrompt(allTags, JSON.stringify(foldersStructure));
  let processedCount = 0;
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    if (abortSignal?.aborted) {
      console.log('[BookmarkOrganizeService] 用户取消了操作, 中止处理');
      return;
    }
    
    const batch = batches[batchIndex];
    const currentBatch = batchIndex + 1;
    
    console.log('[BookmarkOrganizeService] 处理第', currentBatch, '批，共', batch.length, '个书签');
    
    onProgress({
      currentBatch,
      totalBatches: batches.length,
      processedCount,
      totalCount: rootBookmarks.length,
      currentStatus: `正在处理第 ${currentBatch} 批书签 (${batch.length} 个)...`
    });
    
    try {
      // 准备批次数据
      const batchData = batch.map(bookmark => ({
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url!
      }));
      
      const userPrompt = getBookmarkOrganizeUserPrompt(batchData);
      
      console.log('[BookmarkOrganizeService] 发送批次数据到LLM:', batchData);
      
      // 发送到LLM
      const result = await new Promise<OrganizeResult[]>((resolve, reject) => {
        let fullResponse = '';
        
        sendMessage(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          {
            onUpdate: (chunk: string) => {
              fullResponse += chunk;
            },
            onFinish: (finalText?: string) => {
              const responseText = finalText || fullResponse;
              console.log('[BookmarkOrganizeService] LLM响应:', responseText);
              
              try {
                const jsonStr = extractJsonString(responseText);
                if (!jsonStr) {
                  throw new Error('无法从模型输出中提取有效 JSON');
                }
                const parsedResult = JSON.parse(jsonStr) as OrganizeResult[];
                console.log('[BookmarkOrganizeService] 解析后的结果:', parsedResult);
                resolve(parsedResult);
              } catch (error) {
                console.error('[BookmarkOrganizeService] 解析LLM响应失败:', error, '原始响应:', responseText);
                reject(new Error(`解析LLM响应失败: ${error}`));
              }
            },
            onError: (error: Error) => {
              console.error('[BookmarkOrganizeService] LLM请求失败:', error);
              reject(error);
            }
          },
          abortSignal,
          { stream: true }
        );
      });
      
      console.log('[BookmarkOrganizeService] 第', currentBatch, '批处理完成，结果:', result);
      
      // 创建一个从 id 到 url 的映射，以便将 url 添加到整理计划中
      const idToUrlMap = new Map(batch.map(b => [b.id, b.url!]));
      
      // 应用整理结果
      onProgress({
        currentBatch,
        totalBatches: batches.length,
        processedCount,
        totalCount: rootBookmarks.length,
        currentStatus: `正在应用第 ${currentBatch} 批的整理结果...`
      });
      
      const plan = generateOrganizePlan(result, foldersStructure, idToUrlMap);
      await onBatchOrganized(plan);
      
      processedCount += batch.length;
      
      console.log('[BookmarkOrganizeService] 第', currentBatch, '批应用完成，已处理', processedCount, '个书签');
      
    } catch (error) {
      console.error('[BookmarkOrganizeService] 处理第', currentBatch, '批时发生错误:', error);
      
      onProgress({
        currentBatch,
        totalBatches: batches.length,
        processedCount,
        totalCount: rootBookmarks.length,
        currentStatus: `处理第 ${currentBatch} 批时发生错误: ${error}`
      });
      
      // 继续处理下一批，不中断整个流程
      processedCount += batch.length;
    }
  }
  
  onProgress({
    currentBatch: batches.length,
    totalBatches: batches.length,
    processedCount: rootBookmarks.length,
    totalCount: rootBookmarks.length,
    currentStatus: '所有书签整理完成！'
  });
  
  console.log('[BookmarkOrganizeService] 批量整理完成');
};

/**
 * 根据LLM结果生成整理计划
 */
const generateOrganizePlan = (
  results: OrganizeResult[],
  foldersStructure: any[],
  idToUrlMap: Map<string, string>
): BookmarkOrganization[] => {
  console.log('[BookmarkOrganizeService] 开始生成整理计划');

  const organizationPlan: BookmarkOrganization[] = [];
  const folderMap = new Map<string, string>();
  
  const buildFolderMap = (folders: any[]) => {
    for (const folder of folders) {
      folderMap.set(folder.title, folder.id);
      if (folder.children && folder.children.length > 0) {
        buildFolderMap(folder.children);
      }
    }
  };
  
  buildFolderMap(foldersStructure);

  for (const result of results) {
    const url = idToUrlMap.get(result.id);
    if (!url) {
      console.warn(`[BookmarkOrganizeService] 找不到 ID 为 ${result.id} 的书签的 URL，跳过此书签`);
      continue;
    }

    const planItem: BookmarkOrganization = { bookmarkId: result.id, url };

    // 移动操作
    if (result.folder && folderMap.has(result.folder)) {
      planItem.newParentId = folderMap.get(result.folder)!;
    } else if (result.folder) {
      console.warn('[BookmarkOrganizeService] 找不到文件夹:', result.folder);
    }
    // 标签更新
    if (result.tags && result.tags.length > 0) {
      planItem.tags = result.tags;
    }

    // 只有在有实际操作时才添加到计划中
    if (planItem.newParentId || (planItem.tags && planItem.tags.length > 0)) {
        // 如果这是一个仅包含标签更新的计划项，我们需要确保 URL 存在
        if (planItem.tags && planItem.tags.length > 0 && !planItem.url) {
            console.warn(`[BookmarkOrganizeService] 尝试为一个没有 URL 的书签（ID: ${planItem.bookmarkId}）添加标签，已跳过`);
        } else {
            organizationPlan.push(planItem);
        }
    }
  }
  
  console.log('[BookmarkOrganizeService] 整理计划生成完成');
  return organizationPlan;
};
