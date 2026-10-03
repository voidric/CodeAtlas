import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface FileCacheEntry {
  contentHash: string;
  fileSummary?: string;
  symbolSummaries: { [symbolName: string]: string };
  lastAnalyzed: number;
}

export interface CodeAtlasCache {
  version: number;
  files: { [relPath: string]: FileCacheEntry };
  folderSummaries?: { [folderPath: string]: string };
  projectSummary?: string;
}

/**
 * CodeAtlas 本地持久化增量缓存管理器
 * 缓存文件存储于当前工作区根目录的 .vscode/codeatlas.cache.json
 * 通过 MD5 内容哈希比对，未修改文件 0 毫秒跳过，大幅节约模型算力
 */
export class AiCacheManager {
  private cacheFilePath: string | null = null;
  private memoryCache: CodeAtlasCache = { version: 1, files: {} };
  private isLoaded: boolean = false;

  constructor(workspaceRoot?: string) {
    if (workspaceRoot) {
      this.initWorkspace(workspaceRoot);
    }
  }

  public initWorkspace(workspaceRoot: string): void {
    const vscodeDir = path.join(workspaceRoot, '.vscode');
    this.cacheFilePath = path.join(vscodeDir, 'codeatlas.cache.json');
    this.loadCache();
  }

  public getCacheFilePath(): string | null {
    return this.cacheFilePath;
  }

  public static computeHash(content: string): string {
    return crypto.createHash('md5').update(content, 'utf8').digest('hex');
  }

  private loadCache(): void {
    if (!this.cacheFilePath) return;
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const raw = fs.readFileSync(this.cacheFilePath, 'utf8');
        const parsed = JSON.parse(raw) as CodeAtlasCache;
        if (parsed && parsed.version === 1 && parsed.files) {
          this.memoryCache = parsed;
          this.isLoaded = true;
          return;
        }
      }
    } catch (err) {
      console.warn('[AiCacheManager] 缓存文件读取失败，重置为新缓存:', err);
    }
    this.memoryCache = { version: 1, files: {} };
    this.isLoaded = true;
  }

  public saveCache(): void {
    if (!this.cacheFilePath) return;
    try {
      const vscodeDir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir, { recursive: true });
      }
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(this.memoryCache, null, 2), 'utf8');
    } catch (err) {
      console.warn('[AiCacheManager] 保存缓存文件失败:', err);
    }
  }

  /**
   * 检查文件是否有有效且未改动的缓存
   */
  public getFileCache(relPath: string, currentContent?: string): FileCacheEntry | null {
    const normalized = relPath.replace(/\\/g, '/');
    const entry = this.memoryCache.files[normalized];
    if (!entry) return null;

    if (currentContent === undefined || currentContent === null) {
      return entry;
    }

    const currentHash = AiCacheManager.computeHash(currentContent);
    if (entry.contentHash === currentHash) {
      return entry;
    }
    return null;
  }

  /**
   * 更新单文件的缓存记录
   */
  public updateFileCache(
    relPath: string,
    currentContent: string,
    fileSummary?: string,
    symbolSummaries?: { [name: string]: string }
  ): void {
    const normalized = relPath.replace(/\\/g, '/');
    const currentHash = AiCacheManager.computeHash(currentContent);

    const existing = this.memoryCache.files[normalized] || {
      contentHash: currentHash,
      symbolSummaries: {},
      lastAnalyzed: Date.now(),
    };

    existing.contentHash = currentHash;
    existing.lastAnalyzed = Date.now();
    if (fileSummary !== undefined) {
      existing.fileSummary = fileSummary;
    }
    if (symbolSummaries) {
      existing.symbolSummaries = { ...existing.symbolSummaries, ...symbolSummaries };
    }

    this.memoryCache.files[normalized] = existing;
    this.saveCache();
  }

  /**
   * 更新单个符号的摘要缓存
   */
  public updateSymbolSummary(relPath: string, symbolName: string, summary: string, currentContent?: string): void {
    const normalized = relPath.replace(/\\/g, '/');
    const existing = this.memoryCache.files[normalized];
    if (existing) {
      existing.symbolSummaries[symbolName] = summary;
      existing.lastAnalyzed = Date.now();
      if (currentContent) {
        existing.contentHash = AiCacheManager.computeHash(currentContent);
      }
    } else if (currentContent) {
      this.memoryCache.files[normalized] = {
        contentHash: AiCacheManager.computeHash(currentContent),
        symbolSummaries: { [symbolName]: summary },
        lastAnalyzed: Date.now(),
      };
    }
    this.saveCache();
  }

  /**
   * 清空所有缓存
   */
  public clearCache(): void {
    this.memoryCache = { version: 1, files: {} };
    if (this.cacheFilePath && fs.existsSync(this.cacheFilePath)) {
      try {
        fs.unlinkSync(this.cacheFilePath);
      } catch (err) {
        console.warn('[AiCacheManager] 删除缓存文件失败:', err);
      }
    }
  }

  public getProjectSummary(): string | null {
    return this.memoryCache.projectSummary || null;
  }

  public setProjectSummary(summary: string): void {
    this.memoryCache.projectSummary = summary;
    this.saveCache();
  }

  public getFolderSummary(folderPath: string): string | null {
    const normalized = folderPath.replace(/\\/g, '/');
    return this.memoryCache.folderSummaries?.[normalized] || null;
  }

  public setFolderSummary(folderPath: string, summary: string): void {
    const normalized = folderPath.replace(/\\/g, '/');
    if (!this.memoryCache.folderSummaries) {
      this.memoryCache.folderSummaries = {};
    }
    this.memoryCache.folderSummaries[normalized] = summary;
    this.saveCache();
  }

  public getAllFolderSummaries(): { [folderPath: string]: string } {
    return this.memoryCache.folderSummaries || {};
  }

  public getStats(): { totalCachedFiles: number; totalCachedSymbols: number } {
    const files = Object.keys(this.memoryCache.files);
    let totalCachedSymbols = 0;
    for (const f of files) {
      totalCachedSymbols += Object.keys(this.memoryCache.files[f].symbolSummaries || {}).length;
    }
    return {
      totalCachedFiles: files.length,
      totalCachedSymbols,
    };
  }
}
