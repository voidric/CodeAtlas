import { MacroGraphData, MacroModuleNode, MacroRelationEdge, RelationEdge, SymbolNode } from '../types';

/**
 * 宏观全貌架构聚类引擎
 * 支持两套自适应架构视图：
 * 1. 跨文件架构拓扑流 (File-to-File Architecture Flow)：以代码文件为节点，清晰展示文件间导入与调用网络（对平铺根目录工程极佳）
 * 2. 跨包模块聚类图 (Package/Module Clustering)：以一级架构目录为节点，宏观聚类展示
 */
export class MacroClusterEngine {
  /**
   * 将全图符号与依赖边聚类为宏观模块图（自适应判定文件粒度或模块粒度）
   * @param symbols 全局符号列表
   * @param edges 全局关系边列表
   * @param scriptEntries 脚本执行入口集合
   */
  public static cluster(
    symbols: SymbolNode[],
    edges: RelationEdge[],
    scriptEntries: Set<string> = new Set()
  ): MacroGraphData {
    // 1. 统计工作区内独立模块与文件分布
    const moduleMap = new Map<string, {
      id: string;
      name: string;
      path: string;
      symbols: SymbolNode[];
    }>();

    const symbolToModule = new Map<string, string>();

    for (const sym of symbols) {
      const parts = sym.filePath.replace(/\\/g, '/').split('/');
      let moduleName = 'root';
      let modulePath = '';

      if (parts.length > 1) {
        if ((parts[0] === 'src' || parts[0] === 'app') && parts.length > 2) {
          moduleName = `${parts[0]}/${parts[1]}`;
          modulePath = `${parts[0]}/${parts[1]}`;
        } else {
          moduleName = parts[0];
          modulePath = parts[0];
        }
      } else {
        moduleName = '根模块 (root)';
        modulePath = '.';
      }

      symbolToModule.set(sym.id, moduleName);

      if (!moduleMap.has(moduleName)) {
        moduleMap.set(moduleName, {
          id: moduleName,
          name: moduleName,
          path: modulePath,
          symbols: [],
        });
      }
      moduleMap.get(moduleName)!.symbols.push(sym);
    }

    // ⭐ 自适应切换策略：
    // 如果顶级模块数量 <= 2（例如文件全平铺在项目根目录），
    // 传统的目录聚类会导致只显示一个无意义的“根模块(root)”大方块。
    // 此时自动升级为“跨文件架构拓扑流图”，展示每个文件之间的真实依赖关系！
    const hasRootFiles = moduleMap.has('根模块 (root)');
    const isMostlyRootOrSmall = moduleMap.size <= 1 || (hasRootFiles && moduleMap.size <= 2);
    if (isMostlyRootOrSmall) {
      return this.clusterByFiles(symbols, edges, scriptEntries);
    }

    // 2. 正常目录聚类（针对拥有丰富子目录的深层大型工程）
    const modules: MacroModuleNode[] = Array.from(moduleMap.values()).map(m => {
      const funcs = m.symbols.filter(s => s.kind !== 'class');
      const classes = m.symbols.filter(s => s.kind === 'class');
      return {
        id: m.id,
        name: m.name,
        path: m.path,
        kind: 'package',
        symbolCount: m.symbols.length,
        functionCount: funcs.length,
        classCount: classes.length,
      };
    });

    const edgeWeights = new Map<string, {
      source: string;
      target: string;
      weight: number;
      samples: Array<{ caller: string; callee: string }>;
    }>();

    const symNameMap = new Map<string, string>();
    for (const s of symbols) {
      symNameMap.set(s.id, s.name);
    }

    for (const edge of edges) {
      const srcMod = symbolToModule.get(edge.source) || edge.source.split('#')[0];
      const tgtMod = symbolToModule.get(edge.target) || edge.target.split('#')[0];

      if (srcMod && tgtMod && srcMod !== tgtMod) {
        const edgeKey = `${srcMod}-->${tgtMod}`;
        if (!edgeWeights.has(edgeKey)) {
          edgeWeights.set(edgeKey, {
            source: srcMod,
            target: tgtMod,
            weight: 0,
            samples: [],
          });
        }
        const item = edgeWeights.get(edgeKey)!;
        item.weight += 1;
        if (item.samples.length < 5) {
          item.samples.push({
            caller: symNameMap.get(edge.source) || edge.source,
            callee: symNameMap.get(edge.target) || edge.target,
          });
        }
      }
    }

    const macroEdges: MacroRelationEdge[] = Array.from(edgeWeights.values()).map(e => ({
      id: `${e.source}-->${e.target}`,
      source: e.source,
      target: e.target,
      callWeight: e.weight,
      sampleCalls: e.samples,
    }));

    return {
      modules,
      edges: macroEdges,
    };
  }

  /**
   * 将全图符号与依赖边聚类为文件级跨文件拓扑架构图 (File-to-File Architecture Flow)
   * 专为平铺在根目录下的工程或细粒度架构视图设计
   */
  public static clusterByFiles(
    symbols: SymbolNode[],
    edges: RelationEdge[],
    scriptEntries: Set<string> = new Set()
  ): MacroGraphData {
    const fileMap = new Map<string, {
      id: string;
      name: string;
      path: string;
      symbols: SymbolNode[];
    }>();

    const symbolToFile = new Map<string, string>();

    for (const sym of symbols) {
      const fPath = sym.filePath;
      symbolToFile.set(sym.id, fPath);

      if (!fileMap.has(fPath)) {
        const shortName = fPath.split('/').pop() || fPath;
        fileMap.set(fPath, {
          id: fPath,
          name: shortName,
          path: fPath,
          symbols: []
        });
      }
      fileMap.get(fPath)!.symbols.push(sym);
    }

    // 确保脚本入口文件与调用边中的文件也作为独立文件节点存在
    for (const scriptPath of scriptEntries) {
      if (!fileMap.has(scriptPath)) {
        const shortName = scriptPath.split('/').pop() || scriptPath;
        fileMap.set(scriptPath, {
          id: scriptPath,
          name: shortName,
          path: scriptPath,
          symbols: []
        });
      }
    }

    for (const edge of edges) {
      const srcPath = edge.source.split('#')[0];
      if (srcPath && !fileMap.has(srcPath)) {
        const shortName = srcPath.split('/').pop() || srcPath;
        fileMap.set(srcPath, {
          id: srcPath,
          name: shortName,
          path: srcPath,
          symbols: []
        });
      }
      const tgtPath = edge.target.split('#')[0];
      if (tgtPath && !fileMap.has(tgtPath)) {
        const shortName = tgtPath.split('/').pop() || tgtPath;
        fileMap.set(tgtPath, {
          id: tgtPath,
          name: shortName,
          path: tgtPath,
          symbols: []
        });
      }
    }

    const modules: MacroModuleNode[] = Array.from(fileMap.values()).map(m => {
      const funcs = m.symbols.filter(s => s.kind !== 'class');
      const classes = m.symbols.filter(s => s.kind === 'class');
      const isScript = scriptEntries.has(m.path) || funcs.some(f => f.usages?.some(u => u.isTopLevelScript && u.filePath === m.path));
      return {
        id: m.id,
        name: m.name,
        path: m.path,
        kind: 'file',
        isScriptEntry: isScript,
        symbolCount: m.symbols.length,
        functionCount: funcs.length,
        classCount: classes.length,
      };
    });

    // 计算跨文件依赖与调用权重
    const edgeWeights = new Map<string, {
      source: string;
      target: string;
      weight: number;
      samples: Array<{ caller: string; callee: string }>;
    }>();

    const symNameMap = new Map<string, string>();
    for (const s of symbols) {
      symNameMap.set(s.id, s.name);
    }

    for (const edge of edges) {
      const srcFile = symbolToFile.get(edge.source) || edge.source.split('#')[0];
      const tgtFile = symbolToFile.get(edge.target) || edge.target.split('#')[0];

      if (srcFile && tgtFile && srcFile !== tgtFile && fileMap.has(srcFile) && fileMap.has(tgtFile)) {
        const edgeKey = `${srcFile}-->${tgtFile}`;
        if (!edgeWeights.has(edgeKey)) {
          edgeWeights.set(edgeKey, {
            source: srcFile,
            target: tgtFile,
            weight: 0,
            samples: []
          });
        }
        const item = edgeWeights.get(edgeKey)!;
        item.weight += 1;
        if (item.samples.length < 5) {
          item.samples.push({
            caller: symNameMap.get(edge.source) || edge.source.split('#').pop() || edge.source,
            callee: symNameMap.get(edge.target) || edge.target.split('#').pop() || edge.target
          });
        }
      }
    }

    const macroEdges: MacroRelationEdge[] = Array.from(edgeWeights.values()).map(e => ({
      id: `${e.source}-->${e.target}`,
      source: e.source,
      target: e.target,
      callWeight: e.weight,
      sampleCalls: e.samples,
    }));

    return {
      modules,
      edges: macroEdges
    };
  }
}
