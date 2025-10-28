import React, { useEffect, useState } from 'react';
import TagInput from '../../../components/TagInput';
import BookmarkTree from '../../../components/BookmarkTree';
import { addBookmarkTag, getAllBookmarkTags } from '../../../db/indexedDB';
import { sendMessage } from '../../../services/llmService';
import { buildTagGenerationPrompt } from '../../../lib/tagGenerationPrompts';
import { getBookmarkSuggestionSystemPrompt } from '../../../lib/bookmarkSuggestionPrompts';

interface AddBookmarkFormProps {
  initialUrl?: string;
  initialTitle?: string;
  onSuccess?: () => void;
}

const AddBookmarkForm: React.FC<AddBookmarkFormProps> = ({ initialUrl, initialTitle, onSuccess }) => {
  const [title, setTitle] = useState(initialTitle || '');
  const [url, setUrl] = useState(initialUrl || '');
  const [tags, setTags] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [defaultFolderId, setDefaultFolderId] = useState<string>('');

  useEffect(() => {
    // Set default folder to the bookmarks bar
    chrome.bookmarks.getTree((tree) => {
        const bookmarksBar = tree[0]?.children?.[0];
        if (bookmarksBar?.id) {
          setDefaultFolderId(bookmarksBar.id);
          setSelectedFolder(bookmarksBar.id);
        }
    });

    if (!initialUrl && !initialTitle) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          const tabTitle = tabs[0].title || '';
          const tabUrl = tabs[0].url || '';
          setTitle(tabTitle);
          setUrl(tabUrl);
          handleAutoSuggest(tabTitle, tabUrl);
        }
      });
    } else if (initialUrl && initialTitle) {
        handleAutoSuggest(initialTitle, initialUrl);
    }
  }, [initialUrl, initialTitle]);

  const handleAutoSuggest = (currentTitle: string, currentUrl: string) => {
    const autoSuggestEnabled = JSON.parse(localStorage.getItem('autoSuggestBookmarkInfo') || 'false');
    if (autoSuggestEnabled && currentTitle && currentUrl) {
      handleGenerateSuggestions(currentTitle, currentUrl);
    }
  };

  const simplifyBookmarkTree = (nodes: chrome.bookmarks.BookmarkTreeNode[]): any[] => {
    return nodes
      .filter(node => !node.url) // Only folders
      .map(node => {
        const simplifiedNode: any = { title: node.title };
        if (node.children && node.children.length > 0) {
          const childFolders = simplifyBookmarkTree(node.children);
          if (childFolders.length > 0) {
            simplifiedNode.children = childFolders;
          }
        }
        return simplifiedNode;
      });
  };

  const findFolderIdByTitle = (nodes: chrome.bookmarks.BookmarkTreeNode[], title: string): string | null => {
    for (const node of nodes) {
      if (!node.url && node.title === title) {
        return node.id;
      }
      if (node.children) {
        const foundId = findFolderIdByTitle(node.children, title);
        if (foundId) return foundId;
      }
    }
    return null;
  };


  const extractJsonString = (text: string): string | null => {
    if (!text) return null;
    // 优先从 ```json \n ... \n ``` 中提取
    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch ? fencedMatch[1] : text;
    const trimmed = candidate.trim();
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {}
    // 回退：从文本中截取第一个 { 到最后一个 } 的子串尝试解析
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const slice = trimmed.slice(start, end + 1);
      try {
        JSON.parse(slice);
        return slice;
      } catch {}
    }
    return null;
  };

  const unwrapCodeFence = (text: string): string => {
    if (!text) return '';
    const fenced = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
    return (fenced ? fenced[1] : text).trim();
  };

  const handleGenerateSuggestions = async (currentTitle: string, currentUrl: string) => {
    setIsGenerating(true);
    setStatusMessage('正在生成 AI 建议...');
    const controller = new AbortController();
    setAbortController(controller);

    try {
      const [allTags, bookmarkTree] = await Promise.all([
        getAllBookmarkTags(),
        chrome.bookmarks.getTree(),
      ]);
      
      const allExistingTags = Array.from(new Set(allTags.flatMap(b => b.tags)));
      // Start simplifying from the children of the root to provide a cleaner structure to the LLM
      const simplifiedTree = simplifyBookmarkTree(bookmarkTree[0]?.children || []);
      const foldersJson = JSON.stringify(simplifiedTree, null, 2);

      const systemPrompt = getBookmarkSuggestionSystemPrompt(allExistingTags, foldersJson);
      const userMessage = `标题: "${currentTitle}"\nURL: "${currentUrl}"`;
      
      const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }];

      let generatedContent = '';
      await sendMessage(
        messages,
        {
          onUpdate: (chunk: string) => { generatedContent += chunk; },
          onFinish: () => {
            try {
              const jsonStr = extractJsonString(generatedContent);
              if (!jsonStr) {
                throw new Error('无法从模型输出中提取有效 JSON');
              }
              const result = JSON.parse(jsonStr);
              const { tags: suggestedTags, folder: suggestedFolder } = result;

              if (suggestedTags && Array.isArray(suggestedTags)) {
                setTags(suggestedTags);
              }

              if (suggestedFolder) {
                const folderId = findFolderIdByTitle(bookmarkTree, suggestedFolder);
                if (folderId) {
                  setSelectedFolder(folderId);
                } else {
                  console.warn(`Suggested folder "${suggestedFolder}" not found. Using default.`);
                  setSelectedFolder(defaultFolderId);
                }
              } else {
                setSelectedFolder(defaultFolderId);
              }
              setStatusMessage('AI 建议生成成功！');
            } catch (e) {
              console.error('Failed to parse LLM response:', e);
              setStatusMessage('无法解析 AI 建议');
              handleGenerateTags(); // Fallback to only generating tags
            }
            setIsGenerating(false);
            setAbortController(null);
          },
          onError: (error: Error) => {
            console.error('AI 建议生成失败:', error);
            setStatusMessage(`AI 建议生成失败: ${error.message}`);
            setIsGenerating(false);
            setAbortController(null);
          },
        },
        controller.signal
      );
    } catch (error) {
      console.error('AI 建议生成出错:', error);
      setStatusMessage('AI 建议生成出错，请稍后重试');
      setIsGenerating(false);
      setAbortController(null);
    }
  };


  const handleGenerateTags = async () => {
    if (!title || !url) {
      setStatusMessage('请先填写标题和URL');
      return;
    }

    setIsGenerating(true);
    setStatusMessage('正在生成标签...');

    // 创建新的 AbortController
    const controller = new AbortController();
    setAbortController(controller);

    try {
      // 获取现有的标签数据
      const existingBookmarkTags = await getAllBookmarkTags();
      const allExistingTags = Array.from(new Set(
        existingBookmarkTags.flatMap(bookmark => bookmark.tags)
      ));

      // 构建系统提示词
      const systemPrompt = buildTagGenerationPrompt(allExistingTags);
      
      // 构建用户消息
      const userMessage = `标题: "${title}"\nURL: "${url}"`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ];

      let generatedContent = '';

      await sendMessage(
        messages,
        {
          onUpdate: (chunk: string) => {
            generatedContent += chunk;
          },
          onFinish: () => {
            console.log('AddBookmarkForm: onFinish triggered. Final generated content:', generatedContent);
            const finalContent = unwrapCodeFence(generatedContent);
            if (finalContent) {
              // 解析生成的标签
              const generatedTags = finalContent
                .trim()
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0);
              
              setTags(generatedTags);
              setStatusMessage(`成功生成 ${generatedTags.length} 个标签`);
            } else {
              setStatusMessage('标签生成完成，但未获得有效结果');
            }
            setIsGenerating(false);
            setAbortController(null);
          },
          onError: (error: Error) => {
            console.error('生成标签失败:', error);
            setStatusMessage(`生成标签失败: ${error.message}`);
            setIsGenerating(false);
            setAbortController(null);
          },
        },
        controller.signal
      );
    } catch (error) {
      console.error('生成标签出错:', error);
      setStatusMessage('生成标签出错，请稍后重试');
      setIsGenerating(false);
      setAbortController(null);
    }
  };

  const handleCancelGeneration = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsGenerating(false);
      setStatusMessage('已取消生成');
    }
  };

  const handleSave = async () => {
    if (!title || !url) {
      setStatusMessage('Title and URL are required.');
      return;
    }

    try {
      const newBookmark = await chrome.bookmarks.create({
        parentId: selectedFolder,
        title,
        url,
      });

      // 使用表单中的 URL 作为主键保存标签
      if (tags.length > 0) {
        await addBookmarkTag({ url: url, tags });
      }
      
      setStatusMessage('Bookmark saved successfully!');
      if (onSuccess) {
        onSuccess();
      } else {
        setTimeout(() => window.close(), 1000);
      }

    } catch (error) {
      console.error('Error saving bookmark:', error);
      setStatusMessage('Failed to save bookmark.');
    }
  };

  return (
    <div className="p-0 bg-white text-[#1A1A1A] h-full flex flex-col font-sans">
      <h1 className="text-xl font-bold mb-6 text-[#1A1A1A]">Add Bookmark</h1>

      <div className="flex-grow space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-500">Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full px-4 py-3 bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 text-gray-500">URL</label>
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            className="w-full px-4 py-3 bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 text-gray-500">Folder</label>
          <BookmarkTree selectedFolder={selectedFolder} setSelectedFolder={setSelectedFolder} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-500">Tags</label>
            {isGenerating ? (
              <button
                onClick={handleCancelGeneration}
                className="px-3 py-1 text-xs bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
              >
                取消
              </button>
            ) : (
              <button
                onClick={() => handleGenerateTags()}
                disabled={!title || !url}
                className="px-3 py-1 text-xs bg-black text-white rounded-md hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                AI
              </button>
            )}
          </div>
          <TagInput tags={tags} setTags={setTags} />
        </div>
      </div>


      <button
        onClick={handleSave}
        className="w-full bg-black text-white font-bold py-3 px-4 rounded-full hover:bg-gray-800 transition duration-200 mt-6"
      >
        Save
      </button>

      {statusMessage && <p className="mt-4 text-center text-sm">{statusMessage}</p>}
    </div>
  );
};

export default AddBookmarkForm;
