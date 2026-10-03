/**
 * 增量缓存与冷启动快照管理器 (FR-11)
 * 持久化记录各 Python 文件的 mtime 与符号提取快照，实现大型仓库秒级免重扫就绪
 */

import * as fs from 'fs';
import * as path from 'path';
import { SymbolNode, RelationEdge, FileParseResult } from '../types';

export interface FileSnapshot {
  filePath: string;
  mtime: number;
  symbols: SymbolNode[];
  callSites: any[];
  imports: any[];
}

export interface WorkspaceCacheSnapshot {
  version: string;
  updatedAt: string;
  files: Record<string, FileSnapshot>;
  edges: RelationEdge[];
}

export class CacheManager {
  private cacheFilePath: string;

  constructor(workspaceRoot: string) {
    this.cacheFilePath = path.join(workspaceRoot, '.vscode', '.codeatlas_cache.json');
  }

  /**
   * 读取磁盘中的工作区缓存快照
   */
  public loadSnapshot(): WorkspaceCacheSnapshot | null {
    try {
      if (!fs.existsSync(this.cacheFilePath)) {
        return null;
      }
      const raw = fs.readFileSync(this.cacheFilePath, 'utf-8');
      const data = JSON.parse(raw) as WorkspaceCacheSnapshot;
      if (data && data.files && data.edges) {
        return data;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 将当前工作区符号与拓扑快照刷写至磁盘
   */
  public saveSnapshot(
    parseResults: Map<string, FileParseResult>,
    workspaceRoot: string,
    edges: RelationEdge[]
  ): void {
    try {
      const vscodeDir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir, { recursive: true });
      }

      const filesRecord: Record<string, FileSnapshot> = {};

      for (const [relPath, result] of parseResults.entries()) {
        const absPath = path.join(workspaceRoot, relPath);
        let mtime = 0;
        if (fs.existsSync(absPath)) {
          const stat = fs.statSync(absPath);
          mtime = stat.mtimeMs;
        }

        filesRecord[relPath] = {
          filePath: relPath,
          mtime,
          symbols: result.symbols,
          callSites: result.callSites,
          imports: result.imports
        };
      }

      const snapshot: WorkspaceCacheSnapshot = {
        version: '1.0',
        updatedAt: new Date().toISOString(),
        files: filesRecord,
        edges
      };

      fs.writeFileSync(this.cacheFilePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    } catch (err) {
      console.warn('保存 CodeAtlas 快照缓存失败:', err);
    }
  }

  /**
   * 对比当前磁盘文件列表，筛选出需要重新解析的变动文件列表与未变动可复用项
   */
  public diffFiles(
    currentPyFiles: { relPath: string; absPath: string }[],
    snapshot: WorkspaceCacheSnapshot | null
  ): {
    needsParsing: { relPath: string; absPath: string }[];
    reusableParseResults: Map<string, FileParseResult>;
    isFullyValid: boolean;
  } {
    const needsParsing: { relPath: string; absPath: string }[] = [];
    const reusableParseResults = new Map<string, FileParseResult>();

    if (!snapshot) {
      return {
        needsParsing: currentPyFiles,
        reusableParseResults,
        isFullyValid: false
      };
    }

    const currentRelSet = new Set(currentPyFiles.map(f => f.relPath));
    const cachedRelSet = new Set(Object.keys(snapshot.files));

    // 检查是否有被删除的文件
    let hasDeleted = false;
    for (const cachedPath of cachedRelSet) {
      if (!currentRelSet.has(cachedPath)) {
        hasDeleted = true;
        break;
      }
    }

    for (const file of currentPyFiles) {
      const cached = snapshot.files[file.relPath];
      if (!cached) {
        needsParsing.push(file);
        continue;
      }

      try {
        const stat = fs.statSync(file.absPath);
        if (Math.abs(stat.mtimeMs - cached.mtime) < 1) {
          // 未修改，复用
          reusableParseResults.set(file.relPath, {
            filePath: file.relPath,
            symbols: cached.symbols,
            callSites: cached.callSites,
            imports: cached.imports
          });
        } else {
          // 已修改
          needsParsing.push(file);
        }
      } catch {
        needsParsing.push(file);
      }
    }

    const isFullyValid = !hasDeleted && needsParsing.length === 0;

    return {
      needsParsing,
      reusableParseResults,
      isFullyValid
    };
  }
}
