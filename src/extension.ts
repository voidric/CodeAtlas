import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CodeAtlasWebviewProvider, WebviewHostBridge } from './webview/webviewProvider';
import { getWebviewContent } from './webview/uiHtml';
import { resolveImportsAndRelations, getScriptEntries, getScriptPipelines } from './parser/importResolver';
import { ParserRegistry } from './parser/parserRegistry';
import { GraphManager } from './graph/graphManager';
import { PathFinder } from './graph/pathFinder';
import { DeadCodeDetector } from './graph/deadCodeDetector';
import { CacheManager } from './graph/cacheManager';
import { AiCacheManager } from './ai/cacheManager';
import { HierarchyManager } from './graph/hierarchyManager';
import { MacroClusterEngine } from './graph/macroCluster';
import { OllamaClient } from './ai/ollamaClient';
import { SearchEngine } from './search/searchEngine';
import {
  FileParseResult,
  SymbolNode,
  WebviewToHostMessage,
  FunctionNode,
  ArchitectureTreeNode,
  MacroGraphData,
  RelationEdge
} from './types';

export function activate(context: vscode.ExtensionContext) {
  console.log('[CodeAtlas] Extension activating...');
  const graphManager = new GraphManager();
  const ollamaClient = new OllamaClient();
  const searchEngine = new SearchEngine(ollamaClient);
  let cacheManager: CacheManager | null = null;
  const aiCacheManager = new AiCacheManager();
  let currentFocusedSymbolId: string | null = null;
  let cursorDebounceTimer: NodeJS.Timeout | null = null;
  let isProgrammaticNavigating = false;
  let programmaticNavTimer: NodeJS.Timeout | null = null;

  function markProgrammaticNavigation() {
    isProgrammaticNavigating = true;
    if (cursorDebounceTimer) {
      clearTimeout(cursorDebounceTimer);
      cursorDebounceTimer = null;
    }
    if (programmaticNavTimer) {
      clearTimeout(programmaticNavTimer);
    }
    programmaticNavTimer = setTimeout(() => {
      isProgrammaticNavigating = false;
    }, 600);
  }
  let currentHierarchyTree: ArchitectureTreeNode[] = [];
  let currentMacroData: MacroGraphData | null = null;
  let lastParseResults = new Map<string, FileParseResult>();
  const fileAiDocMap = new Map<string, string>();
  let isBatchAnalyzing = false;

  const activePanels = new Set<vscode.WebviewPanel>();

  function isSupportedLanguage(langId: string): boolean {
    return [
      'python',
      'typescript',
      'javascript',
      'typescriptreact',
      'javascriptreact',
    ].includes(langId);
  }

  // 加载与应用用户配置
  function loadExtensionConfig() {
    const config = vscode.workspace.getConfiguration('codeatlas');
    const endpoint = config.get<string>('llmEndpoint', 'http://127.0.0.1:11434/v1');
    const apiKey = config.get<string>('apiKey', '');
    const selectedModel = config.get<string>('selectedModel', 'qwen2.5-coder:7b');

    ollamaClient.updateConfig({
      endpoint,
      apiKey,
      selectedModel: selectedModel || undefined,
    });
  }
  loadExtensionConfig();

  // 监听配置变动
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('codeatlas')) {
        loadExtensionConfig();
        ollamaClient.init().then(() => {
          broadcastOllamaStatus();
          broadcastConfig();
        });
      }
    })
  );

  // 初始化 AI 增量缓存工作区
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    aiCacheManager.initWorkspace(vscode.workspace.workspaceFolders[0].uri.fsPath);
  }

  // 异步探测大模型服务
  ollamaClient.init().then(res => {
    if (res.success) {
      console.log(`[CodeAtlas] 成功连接模型: ${res.activeModel}`);
    } else {
      console.log('[CodeAtlas] 大模型服务未连接，降级为常规检索模式');
    }
    broadcastOllamaStatus();
    broadcastConfig();
  });

  function broadcastOllamaStatus() {
    const isConn = ollamaClient.getIsConnected();
    const model = ollamaClient.getActiveModel();
    webviewProvider.postMessage({
      type: 'SET_OLLAMA_STATUS',
      isConnected: isConn,
      modelName: model,
    });
    for (const p of activePanels) {
      p.webview.postMessage({
        type: 'SET_OLLAMA_STATUS',
        isConnected: isConn,
        modelName: model,
      });
    }
  }

  function broadcastConfig() {
    const config = vscode.workspace.getConfiguration('codeatlas');
    const msg = {
      type: 'SET_CONFIG' as const,
      config: {
        endpoint: config.get<string>('llmEndpoint', 'http://127.0.0.1:11434/v1'),
        apiKey: config.get<string>('apiKey', ''),
        selectedModel: ollamaClient.getActiveModel() || '',
        availableModels: ollamaClient.getAvailableModels(),
        enableIncrementalCache: config.get<boolean>('enableIncrementalCache', true),
        cacheStats: aiCacheManager.getStats(),
      }
    };
    webviewProvider.postMessage(msg);
    for (const p of activePanels) {
      p.webview.postMessage(msg);
    }
  }

  function broadcastFolderAiDoc(folderPath: string, summary: string) {
    webviewProvider.postMessage({
      type: 'UPDATE_FOLDER_AI_DOC',
      folderPath,
      summary,
    });
    for (const p of activePanels) {
      p.webview.postMessage({
        type: 'UPDATE_FOLDER_AI_DOC',
        folderPath,
        summary,
      });
    }
  }

  function broadcastProjectAiDoc(summary: string) {
    webviewProvider.postMessage({
      type: 'UPDATE_PROJECT_AI_DOC',
      summary,
    });
    for (const p of activePanels) {
      p.webview.postMessage({
        type: 'UPDATE_PROJECT_AI_DOC',
        summary,
      });
    }
  }

  function broadcastAiDoc(symbolId: string, summary: string) {
    webviewProvider.postMessage({
      type: 'UPDATE_AI_DOC',
      symbolId,
      summary,
    });
    for (const p of activePanels) {
      p.webview.postMessage({
        type: 'UPDATE_AI_DOC',
        symbolId,
        summary,
      });
    }
  }

  function broadcastHierarchyTree() {
    webviewProvider.postMessage({
      type: 'SET_HIERARCHY_TREE',
      tree: currentHierarchyTree,
    });
    for (const p of activePanels) {
      p.webview.postMessage({
        type: 'SET_HIERARCHY_TREE',
        tree: currentHierarchyTree,
      });
    }
  }

  function broadcastMacroGraph() {
    if (!currentMacroData) return;
    webviewProvider.postMessage({
      type: 'SET_MACRO_GRAPH',
      data: currentMacroData,
    });
    for (const p of activePanels) {
      p.webview.postMessage({
        type: 'SET_MACRO_GRAPH',
        data: currentMacroData,
      });
    }
  }

  function broadcastFileAiDoc(filePath: string, summary: string) {
    webviewProvider.postMessage({
      type: 'UPDATE_FILE_AI_DOC',
      filePath,
      summary,
    });
    for (const p of activePanels) {
      p.webview.postMessage({
        type: 'UPDATE_FILE_AI_DOC',
        filePath,
        summary,
      });
    }
  }

  function broadcastBatchProgress(current: number, total: number, currentItem: string, isRunning: boolean) {
    webviewProvider.postMessage({
      type: 'SET_BATCH_PROGRESS',
      current,
      total,
      currentItem,
      isRunning,
    });
    for (const p of activePanels) {
      p.webview.postMessage({
        type: 'SET_BATCH_PROGRESS',
        current,
        total,
        currentItem,
        isRunning,
      });
    }
  }

  // Webview 与 Extension Host 通信桥接
  const bridge: WebviewHostBridge = {
    onWebviewReady() {
      broadcastOllamaStatus();
      updateWebviewStatus();
      broadcastHierarchyTree();
      broadcastMacroGraph();
      broadcastConfig();

      const projSummary = aiCacheManager.getProjectSummary();
      if (projSummary) {
        broadcastProjectAiDoc(projSummary);
      }
      const folderSums = aiCacheManager.getAllFolderSummaries();
      for (const [fPath, fSum] of Object.entries(folderSums)) {
        broadcastFolderAiDoc(fPath, fSum);
      }
      for (const [fPath, fSum] of fileAiDocMap.entries()) {
        broadcastFileAiDoc(fPath, fSum);
      }

      if (currentFocusedSymbolId) {
        focusSymbolInGraph(currentFocusedSymbolId);
      } else {
        const allNodes = graphManager.getAllNodes();
        if (allNodes.length > 0) {
          focusSymbolInGraph(allNodes[0].id);
        }
      }
    },
    onFocusNode(symbolId: string) {
      focusSymbolInGraph(symbolId);
    },
    onJumpToCode(symbolId: string) {
      jumpToCodeLocation(symbolId);
    },
    onJumpToLocation(filePath: string, line: number, column?: number) {
      jumpToLocation(filePath, line, column);
    },
    onRequestRefresh() {
      scanWorkspace(true);
    },
    onRequestMacroGraph() {
      broadcastMacroGraph();
    },
    onRequestHierarchyTree() {
      broadcastHierarchyTree();
    },
    onSearch(query: string) {
      handleSearch(query);
    },
    onFindPath(fromId: string, toId: string) {
      const result = PathFinder.findPath(graphManager, fromId, toId);
      if (result) {
        webviewProvider.postMessage({
          type: 'HIGHLIGHT_PATH',
          pathNodes: result.nodeIds,
          pathEdges: result.edgeIds,
        });
        for (const p of activePanels) {
          p.webview.postMessage({
            type: 'HIGHLIGHT_PATH',
            pathNodes: result.nodeIds,
            pathEdges: result.edgeIds,
          });
        }
      }
    },
    async onGenerateAiDoc(symbolId: string) {
      const node = graphManager.getNode(symbolId);
      if (!node) return;

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) return;
      const rootPath = workspaceFolders[0].uri.fsPath;
      const absPath = path.join(rootPath, node.filePath);

      let snippet = '';
      try {
        const code = fs.readFileSync(absPath, 'utf-8');
        const lines = code.split(/\r?\n/);
        snippet = lines.slice(node.range.startLine - 1, node.range.endLine).join('\n');
      } catch (err) {
        console.error(`读取源文件失败 [${absPath}]:`, err);
        vscode.window.showErrorMessage(`无法读取源文件: ${node.filePath}`);
        return;
      }

      let sig = node.name;
      if (node.kind !== 'class') {
        const fn = node as FunctionNode;
        sig = `def ${node.name}(${fn.parameters.map(p => `${p.name}: ${p.typeHint || 'Any'}`).join(', ')}) -> ${fn.returnType || 'Any'}`;
      }

      vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: `CodeAtlas: 正在为 [${node.name}] 生成业务契约摘要...`,
      }, async () => {
        const summary = await ollamaClient.generateSummary(node.name, node.kind, sig, snippet);
        if (summary) {
          node.docstring = {
            summary,
            description: node.docstring?.description,
            params: node.docstring?.params,
            returns: node.docstring?.returns,
            isAiGenerated: true,
          };

          aiCacheManager.updateSymbolSummary(node.filePath, node.name, summary, snippet);
          broadcastAiDoc(node.id, summary);
          broadcastConfig();
          vscode.window.showInformationMessage(`已为 [${node.name}] 生成业务契约摘要！`);
        } else {
          vscode.window.showWarningMessage('生成摘要失败，请检查大模型服务是否就绪。');
        }
      });
    },
    async onGenerateFileAiDoc(filePath: string) {
      if (!filePath) return;
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) return;
      const rootPath = workspaceFolders[0].uri.fsPath;
      const absPath = path.isAbsolute(filePath) ? filePath : path.join(rootPath, filePath);

      let fileCode = '';
      try {
        fileCode = fs.readFileSync(absPath, 'utf-8');
      } catch {
        vscode.window.showErrorMessage(`无法读取文件: ${filePath}`);
        return;
      }

      const fileResult = lastParseResults.get(filePath);
      const syms = fileResult ? fileResult.symbols : [];
      const fileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath;

      const symOverview = syms.map(s => {
        if (s.kind === 'class') {
          return `- 类: ${s.name} (基类: ${(s as any).bases?.join(', ') || '无'}, 方法数: ${(s as any).methods?.length || 0})`;
        } else {
          const fn = s as FunctionNode;
          const params = fn.parameters.map(p => p.name).join(', ');
          return `- 函数: ${s.name}(${params}) -> ${fn.returnType || 'Any'}`;
        }
      }).join('\n') || '（无显式顶级类与函数定义）';

      vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: `CodeAtlas: 正在为 [${fileName}] 生成架构报告...`,
      }, async () => {
        const summary = await ollamaClient.generateFileSummary(fileName, filePath, fileCode, symOverview);
        if (summary) {
          fileAiDocMap.set(filePath, summary);
          broadcastFileAiDoc(filePath, summary);
          aiCacheManager.updateFileCache(filePath, fileCode, summary);
          broadcastConfig();
          vscode.window.showInformationMessage(`已完成 [${fileName}] 的 AI 架构报告分析！`);
        } else {
          vscode.window.showWarningMessage(`生成 [${fileName}] 架构报告失败，请检查大模型服务状态。`);
        }
      });
    },
    async onGenerateFolderAiDoc(folderPath: string) {
      if (folderPath === undefined || folderPath === null) return;
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) return;

      const normFolder = folderPath.replace(/\\/g, '/').replace(/\/+$/, '');
      const folderName = normFolder ? (normFolder.split('/').pop() || normFolder) : '根模块';

      const filesInfo: { fileName: string; summary: string }[] = [];
      for (const [relPath] of lastParseResults) {
        const fileNorm = relPath.replace(/\\/g, '/');
        const inFolder = normFolder === '' || fileNorm.startsWith(normFolder + '/');
        if (inFolder) {
          const fileName = fileNorm.split('/').pop() || fileNorm;
          const summary = fileAiDocMap.get(relPath) || aiCacheManager.getFileCache(relPath)?.fileSummary || '';
          filesInfo.push({ fileName, summary });
        }
      }

      vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: `CodeAtlas: 正在生成模块 [${folderName}] 领域架构综述...`,
      }, async () => {
        const summary = await ollamaClient.generateFolderSummary(folderName, folderPath, filesInfo);
        if (summary) {
          aiCacheManager.setFolderSummary(folderPath, summary);
          broadcastFolderAiDoc(folderPath, summary);
          vscode.window.showInformationMessage(`已完成模块 [${folderName}] 领域架构综述！`);
        } else {
          vscode.window.showWarningMessage(`生成模块 [${folderName}] 架构综述失败，请检查服务连接。`);
        }
      });
    },

    async onGenerateProjectAiDoc() {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) return;
      const rootPath = workspaceFolders[0].uri.fsPath;
      const projectName = path.basename(rootPath);

      const folderSummaries: { folderName: string; summary: string }[] = [];
      const seenFolders = new Set<string>();
      for (const relPath of lastParseResults.keys()) {
        const parts = relPath.replace(/\\/g, '/').split('/');
        if (parts.length > 1) {
          const topFolder = parts[0];
          if (!seenFolders.has(topFolder)) {
            seenFolders.add(topFolder);
            const sum = aiCacheManager.getFolderSummary(topFolder) || '';
            folderSummaries.push({ folderName: topFolder, summary: sum });
          }
        }
      }
      if (folderSummaries.length === 0) {
        folderSummaries.push({ folderName: '根目录', summary: '工作区核心逻辑文件' });
      }

      const scriptEntries = Array.from(getScriptEntries(lastParseResults));

      vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: `CodeAtlas: 正在生成 [${projectName}] 全工程架构全景大报告...`,
      }, async () => {
        const summary = await ollamaClient.generateProjectSummary(projectName, folderSummaries, scriptEntries);
        if (summary) {
          aiCacheManager.setProjectSummary(summary);
          broadcastProjectAiDoc(summary);
          vscode.window.showInformationMessage(`已完成 [${projectName}] 全工程架构全景大报告！`);
        } else {
          vscode.window.showWarningMessage('生成全工程架构全景报告失败，请检查大模型服务状态。');
        }
      });
    },

    async onStartWorkspaceAnalysis(scope?: { mode: 'all' | 'folder' | 'file'; targetPath?: string }) {
      if (isBatchAnalyzing) {
        vscode.window.showInformationMessage('当前已有正在执行的批量分析任务。');
        return;
      }
      if (!ollamaClient.getIsConnected() && !ollamaClient.getActiveModel()) {
        const check = await ollamaClient.init();
        if (!check.success) {
          vscode.window.showWarningMessage('无法连接到大模型服务，请检查 API 接口配置。');
          return;
        }
      }

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) return;
      const rootPath = workspaceFolders[0].uri.fsPath;

      let filesToAnalyze: string[] = Array.from(lastParseResults.keys());
      const mode = scope?.mode || 'all';
      const targetPath = (scope?.targetPath || '').replace(/\\/g, '/').replace(/\/+$/, '');

      if (mode === 'file' && targetPath) {
        filesToAnalyze = filesToAnalyze.filter(f => f.replace(/\\/g, '/') === targetPath);
      } else if (mode === 'folder' && targetPath) {
        filesToAnalyze = filesToAnalyze.filter(f => {
          const norm = f.replace(/\\/g, '/');
          return norm === targetPath || norm.startsWith(targetPath + '/');
        });
      }

      if (filesToAnalyze.length === 0) {
        vscode.window.showWarningMessage('指定范围内未检索到可分析的代码文件。');
        return;
      }

      const fgConfig = vscode.workspace.getConfiguration('codeatlas');
      const useCache = fgConfig.get<boolean>('enableIncrementalCache', true);
      const microBatchSize = fgConfig.get<number>('microBatchSize', 3);

      isBatchAnalyzing = true;
      const total = filesToAnalyze.length;
      let current = 0;
      broadcastBatchProgress(0, total, `开始架构分析 (范围: ${mode === 'file' ? '单文件' : (mode === 'folder' ? '目录模块' : '整工程')})...`, true);

      for (const relPath of filesToAnalyze) {
        if (!isBatchAnalyzing) break;

        current++;
        const fileName = relPath.replace(/\\/g, '/').split('/').pop() || relPath;
        const absPath = path.join(rootPath, relPath);

        let fileCode = '';
        try {
          fileCode = fs.readFileSync(absPath, 'utf-8');
        } catch {
          continue;
        }

        const cached = useCache ? aiCacheManager.getFileCache(relPath, fileCode) : null;
        let fileSummary: string | null | undefined = cached?.fileSummary;
        const fileResult = lastParseResults.get(relPath);
        const syms = fileResult ? fileResult.symbols : [];

        // 阶段一：文件级架构定位与契约
        if (fileSummary) {
          fileAiDocMap.set(relPath, fileSummary);
          broadcastFileAiDoc(relPath, fileSummary);
          broadcastBatchProgress(current, total, `[${current}/${total}] ${fileName} (命中文件缓存)`, true);
        } else {
          broadcastBatchProgress(current, total, `[${current}/${total}] 正在推导文件架构: ${fileName}`, true);
          const symOverview = syms.map(s => {
            if (s.kind === 'class') {
              return `- 类: ${s.name} (基类: ${(s as any).bases?.join(', ') || '无'}, 方法数: ${(s as any).methods?.length || 0})`;
            } else {
              const fn = s as FunctionNode;
              return `- 函数: ${s.name}(${(fn.parameters || []).map(p => p.name).join(', ')}) -> ${fn.returnType || 'Any'}`;
            }
          }).join('\n') || '（无显式类与函数定义）';

          try {
            fileSummary = await ollamaClient.generateFileSummary(fileName, relPath, fileCode, symOverview);
            if (fileSummary) {
              fileAiDocMap.set(relPath, fileSummary);
              broadcastFileAiDoc(relPath, fileSummary);
              if (useCache) {
                aiCacheManager.updateFileCache(relPath, fileCode, fileSummary);
              }
            }
          } catch (err) {
            console.error(`分析文件 ${relPath} 失败:`, err);
          }
        }

        if (!isBatchAnalyzing) break;

        // 阶段二：函数级微批聚合契约分析
        const lines = fileCode.split(/\r?\n/);
        const pendingFunctions: { name: string; kind: string; signature: string; codeSnippet: string; node: SymbolNode }[] = [];

        for (const s of syms) {
          if (s.kind !== 'function' && s.kind !== 'method') continue;

          if (cached && cached.symbolSummaries && cached.symbolSummaries[s.name]) {
            s.docstring = {
              summary: cached.symbolSummaries[s.name],
              description: s.docstring?.description,
              params: s.docstring?.params,
              returns: s.docstring?.returns,
              isAiGenerated: true,
            };
            broadcastAiDoc(s.id, cached.symbolSummaries[s.name]);
            continue;
          }

          if (s.docstring?.isAiGenerated) continue;

          const fn = s as FunctionNode;
          const sig = `def ${s.name}(${(fn.parameters || []).map(p => `${p.name}: ${p.typeHint || 'Any'}`).join(', ')}) -> ${fn.returnType || 'Any'}`;
          const snippet = lines.slice(Math.max(0, s.range.startLine - 1), s.range.endLine).join('\n');
          pendingFunctions.push({
            name: s.name,
            kind: s.kind,
            signature: sig,
            codeSnippet: snippet,
            node: s,
          });
        }

        if (pendingFunctions.length > 0) {
          const batchSize = Math.max(1, microBatchSize);
          for (let i = 0; i < pendingFunctions.length; i += batchSize) {
            if (!isBatchAnalyzing) break;

            const batch = pendingFunctions.slice(i, i + batchSize);
            const batchNames = batch.map(b => b.name).join(', ');
            broadcastBatchProgress(
              current,
              total,
              `[${current}/${total}] ${fileName} > 函数契约 (${i + 1}~${Math.min(i + batchSize, pendingFunctions.length)}/${pendingFunctions.length}): ${batchNames}`,
              true
            );

            const batchResults = await ollamaClient.generateFunctionMicroBatch(batch);
            const symbolCacheUpdates: { [name: string]: string } = {};

            for (const item of batch) {
              const sum = batchResults.get(item.name);
              if (sum) {
                item.node.docstring = {
                  summary: sum,
                  description: item.node.docstring?.description,
                  params: item.node.docstring?.params,
                  returns: item.node.docstring?.returns,
                  isAiGenerated: true,
                };
                symbolCacheUpdates[item.name] = sum;
                broadcastAiDoc(item.node.id, sum);
              }
            }

            if (useCache && Object.keys(symbolCacheUpdates).length > 0) {
              aiCacheManager.updateFileCache(relPath, fileCode, undefined, symbolCacheUpdates);
            }
          }
        }
      }

      // 阶段三：级联综合提炼 (自底向上生成目录综述与工程大报告)
      if (isBatchAnalyzing) {
        if (mode === 'folder' && targetPath) {
          // 提炼当前目录
          const folderName = targetPath.split('/').pop() || targetPath;
          broadcastBatchProgress(total, total, `正在提炼模块 [${folderName}] 领域架构综述...`, true);
          const fList: { fileName: string; summary: string }[] = filesToAnalyze.map(f => ({
            fileName: f.split('/').pop() || f,
            summary: fileAiDocMap.get(f) || ''
          }));
          try {
            const fSum = await ollamaClient.generateFolderSummary(folderName, targetPath, fList);
            if (fSum) {
              aiCacheManager.setFolderSummary(targetPath, fSum);
              broadcastFolderAiDoc(targetPath, fSum);
            }
          } catch (e) {
            console.warn(`提炼目录综述失败: ${targetPath}`, e);
          }
        } else if (mode === 'all') {
          // 提炼各模块目录
          broadcastBatchProgress(total, total, '正在自底向上汇总各模块领域架构综述...', true);
          const folderGroups = new Map<string, { fileName: string; summary: string }[]>();
          for (const relPath of filesToAnalyze) {
            const parts = relPath.replace(/\\/g, '/').split('/');
            if (parts.length > 1) {
              const topFolder = parts[0];
              const list = folderGroups.get(topFolder) || [];
              list.push({ fileName: parts[parts.length - 1], summary: fileAiDocMap.get(relPath) || '' });
              folderGroups.set(topFolder, list);
            }
          }

          for (const [topFolder, fList] of folderGroups.entries()) {
            if (!isBatchAnalyzing) break;
            try {
              const fSum = await ollamaClient.generateFolderSummary(topFolder, topFolder, fList);
              if (fSum) {
                aiCacheManager.setFolderSummary(topFolder, fSum);
                broadcastFolderAiDoc(topFolder, fSum);
              }
            } catch (e) {
              console.warn(`生成模块综述失败: ${topFolder}`, e);
            }
          }

          // 提炼工程全景资产
          if (isBatchAnalyzing) {
            broadcastBatchProgress(total, total, '正在生成全工程架构全景大报告...', true);
            const folderSummariesList: { folderName: string; summary: string }[] = [];
            for (const [topFolder] of folderGroups.entries()) {
              const sum = aiCacheManager.getFolderSummary(topFolder) || '';
              folderSummariesList.push({ folderName: topFolder, summary: sum });
            }
            if (folderSummariesList.length === 0) {
              folderSummariesList.push({ folderName: '根模块', summary: '工作区核心代码文件' });
            }
            const scriptEntries = Array.from(getScriptEntries(lastParseResults));
            const projectName = path.basename(rootPath);
            try {
              const pSum = await ollamaClient.generateProjectSummary(projectName, folderSummariesList, scriptEntries);
              if (pSum) {
                aiCacheManager.setProjectSummary(pSum);
                broadcastProjectAiDoc(pSum);
              }
            } catch (e) {
              console.warn('生成全工程全景失败:', e);
            }
          }
        }
      }

      const wasCancelled = !isBatchAnalyzing;
      isBatchAnalyzing = false;
      broadcastBatchProgress(current, total, wasCancelled ? '架构分析已中止' : '架构分析与报告提炼已全部完成！', false);
      broadcastConfig();

      if (wasCancelled) {
        vscode.window.showInformationMessage('批量架构分析已中止，已完成部分已持久化存储。');
      } else {
        vscode.window.showInformationMessage(`架构分析已完成！共处理 ${current} 个文件，各级架构报告已生成。`);
      }
    },

    onCancelWorkspaceAnalysis() {
      if (isBatchAnalyzing) {
        isBatchAnalyzing = false;
        broadcastBatchProgress(0, 0, '批量分析已取消', false);
      }
    },

    async onTestConnection(cfg: any) {
      if (cfg) {
        ollamaClient.updateConfig({
          endpoint: cfg.endpoint,
          apiKey: cfg.apiKey,
          selectedModel: cfg.selectedModel,
        });
      }
      const res = await ollamaClient.testConnection();
      webviewProvider.postMessage({
        type: 'TEST_CONNECTION_RESULT',
        success: res.success,
        message: res.message,
      });
      for (const p of activePanels) {
        p.webview.postMessage({
          type: 'TEST_CONNECTION_RESULT',
          success: res.success,
          message: res.message,
        });
      }
    },

    async onSaveConfig(newConfig: any) {
      const cfg = vscode.workspace.getConfiguration('codeatlas');
      if (newConfig.endpoint !== undefined) {
        await cfg.update('llmEndpoint', newConfig.endpoint, vscode.ConfigurationTarget.Global);
      }
      if (newConfig.apiKey !== undefined) {
        await cfg.update('apiKey', newConfig.apiKey, vscode.ConfigurationTarget.Global);
      }
      if (newConfig.selectedModel !== undefined) {
        await cfg.update('selectedModel', newConfig.selectedModel, vscode.ConfigurationTarget.Global);
      }
      if (newConfig.enableIncrementalCache !== undefined) {
        await cfg.update('enableIncrementalCache', Boolean(newConfig.enableIncrementalCache), vscode.ConfigurationTarget.Global);
      }

      loadExtensionConfig();
      const check = await ollamaClient.init();
      broadcastOllamaStatus();
      broadcastConfig();
      vscode.window.showInformationMessage(check.success ? `CodeAtlas: 配置已保存，连接到模型 [${ollamaClient.getActiveModel()}]！` : 'CodeAtlas: 配置已保存。');
    },

    onClearCache() {
      aiCacheManager.clearCache();
      fileAiDocMap.clear();
      broadcastConfig();
      vscode.window.showInformationMessage('CodeAtlas: 已清空本地架构分析缓存。');
    },

    async onExportMarkdownDoc() {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) return;
      const rootPath = workspaceFolders[0].uri.fsPath;
      const projectName = path.basename(rootPath);

      let md = `# ${projectName} - 架构资产与契约分析大报告\n\n`;
      md += `> 本报告由 CodeAtlas 自动化架构引擎生成，整合了全工程宏观定位、模块领域划分、文件核心职责与底层函数契约。\n\n`;

      // 1. 工程全景架构
      const projSummary = aiCacheManager.getProjectSummary();
      md += `## 1. 全工程架构全景\n\n`;
      if (projSummary) {
        md += `${projSummary}\n\n`;
      } else {
        md += `*暂无全工程架构综述，可通过 CodeAtlas 运行批量分析自动推导。*\n\n`;
      }

      // 2. 模块与目录架构
      md += `## 2. 模块与领域目录架构\n\n`;
      const seenFolders = new Set<string>();
      for (const relPath of lastParseResults.keys()) {
        const parts = relPath.replace(/\\/g, '/').split('/');
        if (parts.length > 1) {
          seenFolders.add(parts[0]);
        }
      }
      if (seenFolders.size > 0) {
        for (const f of Array.from(seenFolders).sort()) {
          md += `### 模块: ${f}\n\n`;
          const fSum = aiCacheManager.getFolderSummary(f);
          if (fSum) {
            md += `${fSum}\n\n`;
          } else {
            md += `*暂无该模块专属综述。*\n\n`;
          }
        }
      } else {
        md += `*工作区代码位于根目录，未划分二级子模块。*\n\n`;
      }

      // 3. 文件架构与核心能力
      md += `## 3. 文件核心职责与执行管道\n\n`;
      const scriptEntries = getScriptEntries(lastParseResults);
      for (const [relPath, parseRes] of lastParseResults.entries()) {
        const isEntry = scriptEntries.has(relPath);
        md += `### ${relPath} ${isEntry ? '*(独立脚本入口)*' : ''}\n\n`;
        const fSum = fileAiDocMap.get(relPath) || aiCacheManager.getFileCache(relPath)?.fileSummary;
        if (fSum) {
          md += `${fSum}\n\n`;
        }

        const syms = parseRes.symbols;
        if (syms.length > 0) {
          md += `#### 实体契约清单 (${syms.length} 个)\n\n`;
          for (const s of syms) {
            const doc = s.docstring?.summary || '暂无详细功能说明';
            if (s.kind === 'class') {
              md += `- **类 \`${s.name}\`**: ${doc}\n`;
            } else {
              const fn = s as FunctionNode;
              const params = (fn.parameters || []).map(p => `${p.name}: ${p.typeHint || 'Any'}`).join(', ');
              md += `- **函数 \`${s.name}(${params})\`**: ${doc}\n`;
            }
          }
          md += `\n`;
        }
      }

      const reportPath = path.join(rootPath, 'PROJECT_ARCHITECTURE_REPORT.md');
      try {
        fs.writeFileSync(reportPath, md, 'utf-8');
        const docUri = vscode.Uri.file(reportPath);
        const textDoc = await vscode.workspace.openTextDocument(docUri);
        await vscode.window.showTextDocument(textDoc, { preview: false });
        vscode.window.showInformationMessage('架构分析大报告已导出为 PROJECT_ARCHITECTURE_REPORT.md 并在编辑器中打开！');
      } catch (err: any) {
        vscode.window.showErrorMessage(`导出 Markdown 架构大报告失败: ${err?.message || String(err)}`);
      }
    },
  };

  const webviewProvider = new CodeAtlasWebviewProvider(context.extensionUri, bridge);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CodeAtlasWebviewProvider.viewType, webviewProvider)
  );

  // 聚焦指定符号
  function focusSymbolInGraph(symbolId: string) {
    const egoData = graphManager.getEgoGraph(symbolId);
    if (egoData) {
      currentFocusedSymbolId = symbolId;
      webviewProvider.postMessage({
        type: 'SET_EGO_GRAPH',
        data: egoData,
      });
      for (const p of activePanels) {
        p.webview.postMessage({
          type: 'SET_EGO_GRAPH',
          data: egoData,
        });
      }
      updateWebviewStatus();
    }
  }

  // 更新 Webview 统计状态
  function updateWebviewStatus() {
    const stats = graphManager.getStats();
    webviewProvider.postMessage({
      type: 'SET_STATUS',
      status: '就绪',
      totalSymbols: stats.totalNodes,
      totalEdges: stats.totalEdges,
    });
    for (const p of activePanels) {
      p.webview.postMessage({
        type: 'SET_STATUS',
        status: '就绪',
        totalSymbols: stats.totalNodes,
        totalEdges: stats.totalEdges,
      });
    }
  }

  // 跳转至对应源码文件与行号
  async function jumpToCodeLocation(symbolId: string) {
    const node = graphManager.getNode(symbolId);
    if (!node) return;

    markProgrammaticNavigation();
    currentFocusedSymbolId = symbolId;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return;

    const rootPath = workspaceFolders[0].uri.fsPath;
    const absPath = path.join(rootPath, node.filePath);
    const docUri = vscode.Uri.file(absPath);

    try {
      const doc = await vscode.workspace.openTextDocument(docUri);
      const editor = await vscode.window.showTextDocument(doc, { preview: false });

      const startLine = Math.max(0, node.range.startLine - 1);
      const startCol = Math.max(0, node.range.startColumn);
      const endLine = Math.max(0, node.range.endLine - 1);
      const endCol = Math.max(0, node.range.endColumn);

      const targetRange = new vscode.Range(startLine, startCol, endLine, endCol);
      editor.selection = new vscode.Selection(targetRange.start, targetRange.start);
      editor.revealRange(targetRange, vscode.TextEditorRevealType.InCenter);
    } catch {
      vscode.window.showErrorMessage(`无法打开文件: ${node.filePath}`);
    }
  }

  // 跳转至指定文件绝对/相对路径与行号 (用于跳转至具体代码引用位置)
  async function jumpToLocation(filePath: string, line: number, column: number = 1) {
    markProgrammaticNavigation();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return;

    const rootPath = workspaceFolders[0].uri.fsPath;
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(rootPath, filePath);
    const docUri = vscode.Uri.file(absPath);

    try {
      const doc = await vscode.workspace.openTextDocument(docUri);
      const editor = await vscode.window.showTextDocument(doc, { preview: false });

      const targetLine = Math.max(0, line - 1);
      const targetCol = Math.max(0, column > 0 ? column - 1 : 0);
      const pos = new vscode.Position(targetLine, targetCol);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    } catch {
      vscode.window.showErrorMessage(`无法打开文件: ${filePath}`);
    }
  }

  // 搜索处理 (支持自然语言语义检索与复合过滤)
  async function handleSearch(query: string) {
    if (!query) return;
    const allNodes = graphManager.getAllNodes();
    const results = await searchEngine.search(allNodes, query, 5);
    if (results.length > 0) {
      focusSymbolInGraph(results[0].node.id);
    }
  }

  // 工作区多语言扫描与增量解析
  async function scanWorkspace(showNotification = false) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    if (!cacheManager) {
      cacheManager = new CacheManager(rootPath);
    }

    const config = vscode.workspace.getConfiguration('codeatlas');
    const ignoreDirs: string[] = config.get('ignoreDirs') || [
      '.venv',
      'venv',
      '__pycache__',
      '.git',
      'site-packages',
      'node_modules',
      'dist',
      'out',
      'build',
    ];
    const excludePattern = `{${ignoreDirs.map(d => `**/${d}/**`).join(',')}}`;
    const globPattern = ParserRegistry.getGlobPattern();

    const progressOptions: vscode.ProgressOptions = {
      location: vscode.ProgressLocation.Window,
      title: 'CodeAtlas',
    };

    await vscode.window.withProgress(progressOptions, async (progress) => {
      progress.report({ message: '正在扫描项目代码文件...' });
      const foundUris = await vscode.workspace.findFiles(globPattern, excludePattern);
      const currentFiles = foundUris.map(u => ({
        absPath: u.fsPath,
        relPath: path.relative(rootPath, u.fsPath).replace(/\\/g, '/'),
      }));

      // 读取磁盘缓存快照
      const snapshot = cacheManager!.loadSnapshot();
      const diff = cacheManager!.diffFiles(currentFiles, snapshot);

      const finalParseResults = new Map<string, FileParseResult>(diff.reusableParseResults);

      if (diff.needsParsing.length > 0) {
        progress.report({ message: `增量解析语法树 (${diff.needsParsing.length}/${currentFiles.length} 个文件)...` });
        for (const item of diff.needsParsing) {
          try {
            const parser = ParserRegistry.getParserForFile(item.relPath);
            if (!parser) continue;

            const rawContent = await vscode.workspace.fs.readFile(vscode.Uri.file(item.absPath));
            const code = Buffer.from(rawContent).toString('utf-8');
            const parsed = parser.parse(code, item.relPath);
            finalParseResults.set(item.relPath, parsed);
          } catch (err) {
            console.error(`[CodeAtlas] 解析文件失败 [${item.relPath}]:`, err);
          }
        }
      }

      let edges: RelationEdge[] = [];
      const symbols: SymbolNode[] = [];
      for (const fileResult of finalParseResults.values()) {
        symbols.push(...fileResult.symbols);
      }

      try {
        progress.report({ message: '拓扑消歧绑定与构建...' });
        edges = resolveImportsAndRelations(finalParseResults);

        graphManager.loadWorkspace(symbols, edges);

        // 保存最新快照
        cacheManager!.saveSnapshot(finalParseResults, rootPath, edges);

        lastParseResults = finalParseResults;
        for (const relPath of finalParseResults.keys()) {
          const cached = aiCacheManager.getFileCache(relPath);
          if (cached?.fileSummary) {
            fileAiDocMap.set(relPath, cached.fileSummary);
            broadcastFileAiDoc(relPath, cached.fileSummary);
          }
        }
        const scriptEntries = getScriptEntries(finalParseResults);
        const scriptPipelines = getScriptPipelines(finalParseResults);

        // 运行死代码雷达检测
        const deadNodes = DeadCodeDetector.detect(graphManager, { updateNodeFlag: true });
        const deadSet = new Set<string>(deadNodes.map(n => n.id));

        // 构建架构资产树与宏观模块聚类图
        currentHierarchyTree = HierarchyManager.buildTree(symbols, deadSet, scriptEntries, scriptPipelines);
        currentMacroData = MacroClusterEngine.cluster(symbols, edges, scriptEntries);

        broadcastHierarchyTree();
        broadcastMacroGraph();
        updateWebviewStatus();

        // 默认聚焦
        if (!currentFocusedSymbolId && symbols.length > 0) {
          focusSymbolInGraph(symbols[0].id);
        } else if (currentFocusedSymbolId) {
          focusSymbolInGraph(currentFocusedSymbolId);
        }
      } catch (err) {
        console.error('[CodeAtlas] 拓扑与关系构建异常，降级构建资产树:', err);
        lastParseResults = finalParseResults;
        const scriptEntries = getScriptEntries(finalParseResults);
        const scriptPipelines = getScriptPipelines(finalParseResults);
        currentHierarchyTree = HierarchyManager.buildTree(symbols, new Set(), scriptEntries, scriptPipelines);
        broadcastHierarchyTree();
        updateWebviewStatus();
      }

      if (showNotification) {
        vscode.window.showInformationMessage(
          `CodeAtlas 扫描完成：共提取 ${symbols.length} 个类与函数，构建 ${edges.length} 条关系边。`
        );
      }
    });
  }

  // 监听光标移动联动 (防抖 250ms)
  const debounceDelay = vscode.workspace.getConfiguration('codeatlas').get<number>('cursorDebounceMs') || 250;
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (isProgrammaticNavigating) return;
      if (!isSupportedLanguage(e.textEditor.document.languageId)) return;

      if (cursorDebounceTimer) {
        clearTimeout(cursorDebounceTimer);
      }

      cursorDebounceTimer = setTimeout(() => {
        if (isProgrammaticNavigating) return;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) return;

        const rootPath = workspaceFolders[0].uri.fsPath;
        const currentRelPath = path.relative(rootPath, e.textEditor.document.uri.fsPath).replace(/\\/g, '/');
        const line = e.selections[0].active.line + 1;

        const candidates = graphManager.getAllNodes().filter(node => {
          return node.filePath === currentRelPath &&
                 line >= node.range.startLine &&
                 line <= node.range.endLine;
        });

        if (candidates.length === 0) return;

        // 优先匹配最具体的内层实体（例如方法/函数优先于包含它们的外层类）
        candidates.sort((a, b) => {
          const spanA = a.range.endLine - a.range.startLine;
          const spanB = b.range.endLine - b.range.startLine;
          if (spanA !== spanB) return spanA - spanB;
          if (a.kind !== b.kind) {
            if (a.kind === 'method' || a.kind === 'function') return -1;
            if (b.kind === 'method' || b.kind === 'function') return 1;
          }
          return 0;
        });

        const matched = candidates[0];

        if (matched && matched.id !== currentFocusedSymbolId) {
          focusSymbolInGraph(matched.id);
        }
      }, debounceDelay);
    })
  );

  // 监听文件保存 (触发增量重新解析)
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (!isSupportedLanguage(doc.languageId)) return;
      scanWorkspace(false);
    })
  );

  // 注册命令
  context.subscriptions.push(
    vscode.commands.registerCommand('codeatlas.refresh', () => {
      scanWorkspace(true);
    }),
    vscode.commands.registerCommand('codeatlas.showInGraph', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !isSupportedLanguage(editor.document.languageId)) return;

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) return;
      const rootPath = workspaceFolders[0].uri.fsPath;
      const relPath = path.relative(rootPath, editor.document.uri.fsPath).replace(/\\/g, '/');
      const line = editor.selection.active.line + 1;

      const candidates = graphManager.getAllNodes().filter(node => {
        return node.filePath === relPath &&
               line >= node.range.startLine &&
               line <= node.range.endLine;
      });

      if (candidates.length === 0) return;

      candidates.sort((a, b) => {
        const spanA = a.range.endLine - a.range.startLine;
        const spanB = b.range.endLine - b.range.startLine;
        if (spanA !== spanB) return spanA - spanB;
        if (a.kind !== b.kind) {
          if (a.kind === 'method' || a.kind === 'function') return -1;
          if (b.kind === 'method' || b.kind === 'function') return 1;
        }
        return 0;
      });

      focusSymbolInGraph(candidates[0].id);
    }),
    vscode.commands.registerCommand('codeatlas.openWebviewPanel', () => {
      const panel = vscode.window.createWebviewPanel(
        'codeatlas.editorPanel',
        'CodeAtlas 全景图谱与资产驾驶舱',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      activePanels.add(panel);
      panel.onDidDispose(() => {
        activePanels.delete(panel);
      });

      panel.webview.html = getWebviewContent('panel_nonce');
      panel.webview.onDidReceiveMessage((message: WebviewToHostMessage) => {
        switch (message.type) {
          case 'WEBVIEW_READY': {
            const stats = graphManager.getStats();
            panel.webview.postMessage({
              type: 'SET_STATUS',
              status: '就绪',
              totalSymbols: stats.totalNodes,
              totalEdges: stats.totalEdges,
            });
            panel.webview.postMessage({
              type: 'SET_OLLAMA_STATUS',
              isConnected: ollamaClient.getIsConnected(),
              modelName: ollamaClient.getActiveModel(),
            });
            if (currentHierarchyTree.length > 0) {
              panel.webview.postMessage({
                type: 'SET_HIERARCHY_TREE',
                tree: currentHierarchyTree,
              });
            }
            if (currentMacroData) {
              panel.webview.postMessage({
                type: 'SET_MACRO_GRAPH',
                data: currentMacroData,
              });
            }
            if (currentFocusedSymbolId) {
              const ego = graphManager.getEgoGraph(currentFocusedSymbolId);
              if (ego) panel.webview.postMessage({ type: 'SET_EGO_GRAPH', data: ego });
            }
            break;
          }
          case 'FOCUS_NODE':
            focusSymbolInGraph(message.symbolId);
            break;
          case 'JUMP_TO_CODE':
            jumpToCodeLocation(message.symbolId);
            break;
          case 'JUMP_TO_LOCATION':
            jumpToLocation(message.filePath, message.line, message.column);
            break;
          case 'REQUEST_REFRESH':
            scanWorkspace(true);
            break;
          case 'REQUEST_MACRO_GRAPH':
            if (currentMacroData) {
              panel.webview.postMessage({
                type: 'SET_MACRO_GRAPH',
                data: currentMacroData,
              });
            }
            break;
          case 'REQUEST_HIERARCHY_TREE':
            if (currentHierarchyTree.length > 0) {
              panel.webview.postMessage({
                type: 'SET_HIERARCHY_TREE',
                tree: currentHierarchyTree,
              });
            }
            break;
          case 'SEARCH':
            handleSearch(message.query);
            break;
          case 'FIND_PATH':
            bridge.onFindPath(message.fromSymbolId, message.toSymbolId);
            break;
          case 'GENERATE_AI_DOC':
            bridge.onGenerateAiDoc(message.symbolId);
            break;
          case 'GENERATE_FILE_AI_DOC':
            bridge.onGenerateFileAiDoc(message.filePath);
            break;
          case 'START_WORKSPACE_ANALYSIS':
            bridge.onStartWorkspaceAnalysis((message as any).scope);
            break;
          case 'CANCEL_WORKSPACE_ANALYSIS':
            bridge.onCancelWorkspaceAnalysis();
            break;
        }
      });
    })
  );

  // 初始启动自动扫描
  if (vscode.workspace.getConfiguration('codeatlas').get('scanOnStartup', true)) {
    scanWorkspace(false);
  }
  console.log('[CodeAtlas] Extension activated successfully.');
}

export function deactivate() {}
