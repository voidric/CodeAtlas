import { ArchitectureTreeNode, ClassNode, FunctionNode, SymbolNode } from '../types';

/**
 * 架构资产树构建与索引管理器
 * 将平铺的 SymbolNode 转换为层级分明的工作区/目录/文件/类/函数资产树
 */
export class HierarchyManager {
  /**
   * 基于全局符号节点与死代码候选集构建层级树
   * @param symbols 全局符号列表
   * @param deadCodeIds 死代码节点 ID 集合
   */
  public static buildTree(
    symbols: SymbolNode[],
    deadCodeIds: Set<string> = new Set(),
    scriptEntries: Set<string> = new Set(),
    scriptPipelines: Map<string, import('../types').ScriptPipelineStep[]> = new Map()
  ): ArchitectureTreeNode[] {
    // 1. 按文件分组符号
    const fileSymbolMap = new Map<string, SymbolNode[]>();
    for (const sym of symbols) {
      const list = fileSymbolMap.get(sym.filePath) || [];
      list.push(sym);
      fileSymbolMap.set(sym.filePath, list);
    }

    // 确保包含无符号但属于直接执行入口的脚本文件
    for (const scriptPath of scriptEntries) {
      if (!fileSymbolMap.has(scriptPath)) {
        fileSymbolMap.set(scriptPath, []);
      }
    }

    // 2. 根目录虚拟节点
    interface TempFolder {
      name: string;
      path: string;
      subFolders: Map<string, TempFolder>;
      files: Set<string>;
    }

    const rootFolder: TempFolder = {
      name: '',
      path: '',
      subFolders: new Map(),
      files: new Set(),
    };

    // 3. 构建目录拓扑骨架
    for (const filePath of fileSymbolMap.keys()) {
      const parts = filePath.replace(/\\/g, '/').split('/');
      const fileName = parts.pop()!;
      let curr = rootFolder;
      let currPath = '';

      for (const part of parts) {
        currPath = currPath ? `${currPath}/${part}` : part;
        if (!curr.subFolders.has(part)) {
          curr.subFolders.set(part, {
            name: part,
            path: currPath,
            subFolders: new Map(),
            files: new Set(),
          });
        }
        curr = curr.subFolders.get(part)!;
      }
      curr.files.add(filePath);
    }

    // 4. 递归将 TempFolder 转换为 ArchitectureTreeNode
    function convertFolder(folder: TempFolder): ArchitectureTreeNode {
      const children: ArchitectureTreeNode[] = [];

      // 子文件夹递归
      const sortedFolderNames = Array.from(folder.subFolders.keys()).sort();
      for (const name of sortedFolderNames) {
        children.push(convertFolder(folder.subFolders.get(name)!));
      }

      // 文件节点构建
      const sortedFiles = Array.from(folder.files).sort();
      for (const filePath of sortedFiles) {
        const fileNode = convertFile(
          filePath,
          fileSymbolMap.get(filePath) || [],
          deadCodeIds,
          scriptEntries.has(filePath),
          scriptPipelines.get(filePath)
        );
        children.push(fileNode);
      }

      // 统计汇总
      const stats = {
        totalClasses: children.reduce((sum, c) => sum + c.stats.totalClasses, 0),
        totalFunctions: children.reduce((sum, c) => sum + c.stats.totalFunctions, 0),
        deadCodeCount: children.reduce((sum, c) => sum + c.stats.deadCodeCount, 0),
      };

      return {
        id: `folder:${folder.path || 'root'}`,
        name: folder.name || 'Workspace Root',
        kind: 'folder',
        filePath: folder.path,
        stats,
        children,
      };
    }

    // 5. 构建单文件节点
    function convertFile(
      filePath: string,
      syms: SymbolNode[],
      deadSet: Set<string>,
      isScriptEntry?: boolean,
      pipeline?: import('../types').ScriptPipelineStep[]
    ): ArchitectureTreeNode {
      const fileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
      const fileChildren: ArchitectureTreeNode[] = [];

      const classes = syms.filter((s): s is ClassNode => s.kind === 'class');
      const topLevelFuncs = syms.filter(
        (s): s is FunctionNode => s.kind !== 'class' && !s.parentClassId
      );
      const methodsByClass = new Map<string, FunctionNode[]>();

      for (const s of syms) {
        if (s.kind !== 'class' && s.parentClassId) {
          const list = methodsByClass.get(s.parentClassId) || [];
          list.push(s);
          methodsByClass.set(s.parentClassId, list);
        }
      }

      // 类节点
      for (const cls of classes) {
        const methods = methodsByClass.get(cls.id) || [];
        const isDead = deadSet.has(cls.id);
        const methodNodes: ArchitectureTreeNode[] = methods.map((m) => {
          const mDead = deadSet.has(m.id);
          return {
            id: m.id,
            name: m.name,
            kind: 'method',
            filePath,
            symbolId: m.id,
            range: m.range,
            returnType: m.returnType,
            isDeadCodeCandidate: mDead,
            docSummary: m.docstring?.summary,
            stats: { totalClasses: 0, totalFunctions: 1, deadCodeCount: mDead ? 1 : 0 },
            children: [],
          };
        });

        const classDeadCount = (isDead ? 1 : 0) + methodNodes.reduce((s, m) => s + m.stats.deadCodeCount, 0);

        fileChildren.push({
          id: cls.id,
          name: cls.name,
          kind: 'class',
          filePath,
          symbolId: cls.id,
          range: cls.range,
          isDeadCodeCandidate: isDead,
          docSummary: cls.docstring?.summary,
          stats: {
            totalClasses: 1,
            totalFunctions: methodNodes.length,
            deadCodeCount: classDeadCount,
          },
          children: methodNodes,
        });
      }

      // 顶层函数节点
      for (const fn of topLevelFuncs) {
        const isDead = deadSet.has(fn.id);
        fileChildren.push({
          id: fn.id,
          name: fn.name,
          kind: 'function',
          filePath,
          symbolId: fn.id,
          range: fn.range,
          returnType: fn.returnType,
          isDeadCodeCandidate: isDead,
          docSummary: fn.docstring?.summary,
          stats: {
            totalClasses: 0,
            totalFunctions: 1,
            deadCodeCount: isDead ? 1 : 0,
          },
          children: [],
        });
      }

      const fileStats = {
        totalClasses: classes.length,
        totalFunctions: topLevelFuncs.length + Array.from(methodsByClass.values()).reduce((a, b) => a + b.length, 0),
        deadCodeCount: fileChildren.reduce((sum, c) => sum + c.stats.deadCodeCount, 0),
      };

      return {
        id: `file:${filePath}`,
        name: fileName,
        kind: 'file',
        filePath,
        isScriptEntry: !!isScriptEntry,
        scriptPipeline: pipeline && pipeline.length > 0 ? pipeline : undefined,
        stats: fileStats,
        children: fileChildren,
      };
    }

    // 6. 若只有一个顶层根目录，则直接返回其 children，避免多余嵌套
    const root = convertFolder(rootFolder);
    return root.children.length > 0 ? root.children : [root];
  }
}
