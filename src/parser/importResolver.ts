import {
  FileParseResult,
  SymbolNode,
  ClassNode,
  FunctionNode,
  RelationEdge,
  FileImport,
  CallSiteInfo,
  EdgeKind
} from '../types';

/**
 * 单文件局部作用域项
 */
export interface LocalScopeItem {
  name: string;
  kind: 'symbol' | 'module';
  targetSymbolId?: string;
  targetSymbol?: SymbolNode;
  targetFilePath?: string;
}

/**
 * 跨文件导入消歧与关系图谱构建器
 */
export class ImportResolver {
  private allSymbolsById = new Map<string, SymbolNode>();
  private symbolsByFilePath = new Map<string, Map<string, SymbolNode>>();
  private classesByName = new Map<string, ClassNode[]>();
  private functionsByName = new Map<string, FunctionNode[]>();
  private localScopes = new Map<string, Map<string, LocalScopeItem>>();

  constructor(private parseResults: Map<string, FileParseResult>) {
    this.indexSymbols();
    this.buildAllLocalScopes();
  }

  /**
   * 建立全工作区符号索引表
   */
  private indexSymbols(): void {
    for (const [filePath, fileResult] of this.parseResults.entries()) {
      const fileSymMap = new Map<string, SymbolNode>();
      this.symbolsByFilePath.set(filePath, fileSymMap);

      for (const sym of fileResult.symbols) {
        this.allSymbolsById.set(sym.id, sym);
        fileSymMap.set(sym.name, sym);

        if (sym.kind === 'class') {
          const list = this.classesByName.get(sym.name) || [];
          list.push(sym as ClassNode);
          this.classesByName.set(sym.name, list);
        } else {
          const list = this.functionsByName.get(sym.name) || [];
          list.push(sym as FunctionNode);
          this.functionsByName.set(sym.name, list);
        }
      }
    }
  }

  /**
   * 模块路径转换为工作区内规范文件路径
   */
  public resolveModuleFilePath(fromFilePath: string, imp: FileImport): string | undefined {
    const allFiles = Array.from(this.parseResults.keys());

    // 1. 相对导入 (例如: from ..models import User, from .payment_service import ...)
    if (imp.isRelative && imp.level !== undefined && imp.level > 0) {
      const currentDirParts = fromFilePath.split('/').slice(0, -1);
      const targetDirParts = [...currentDirParts];

      // level = 1: 当前目录; level = 2: 上级目录; level = 3: 上上级目录
      for (let i = 1; i < imp.level; i++) {
        if (targetDirParts.length > 0) {
          targetDirParts.pop();
        }
      }

      const modPath = imp.moduleName ? imp.moduleName.replace(/\./g, '/') : '';
      const baseCandidate = targetDirParts.length > 0 ? `${targetDirParts.join('/')}/${modPath}` : modPath;

      const candidates = [
        `${baseCandidate}.py`,
        `${baseCandidate}/__init__.py`,
        baseCandidate
      ];

      for (const cand of candidates) {
        const clean = cand.replace(/^\/+/, '');
        if (this.parseResults.has(clean)) {
          return clean;
        }
      }

      // 如果 imp.importedSymbol 是一个子模块文件 (例如 from ..utils import calculator)
      if (imp.importedSymbol) {
        const subCandidate = `${baseCandidate}/${imp.importedSymbol}.py`.replace(/^\/+/, '');
        if (this.parseResults.has(subCandidate)) {
          return subCandidate;
        }
      }
    }

    // 2. 绝对导入 (例如: from sample_project.services.order_service import checkout_order)
    if (imp.moduleName) {
      const modSlash = imp.moduleName.replace(/\./g, '/');
      const candidates = [
        `${modSlash}.py`,
        `${modSlash}/__init__.py`
      ];

      for (const cand of candidates) {
        if (this.parseResults.has(cand)) {
          return cand;
        }
      }

      // 模糊匹配：检查工作区内是否有以该模块名结尾的文件
      for (const file of allFiles) {
        if (file.endsWith(`/${modSlash}.py`) || file === `${modSlash}.py`) {
          return file;
        }
      }

      // 如果 importedSymbol 是子模块
      if (imp.importedSymbol) {
        const subCand = `${modSlash}/${imp.importedSymbol}.py`;
        for (const file of allFiles) {
          if (file.endsWith(`/${subCand}`) || file === subCand) {
            return file;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * 为单个文件建立 LocalScope 作用域符号别名表
   */
  public buildLocalScopeForFile(filePath: string): Map<string, LocalScopeItem> {
    const scope = new Map<string, LocalScopeItem>();
    const fileResult = this.parseResults.get(filePath);
    if (!fileResult) return scope;

    // 1. 本地定义的所有类与顶层函数
    for (const sym of fileResult.symbols) {
      if (sym.kind === 'class') {
        scope.set(sym.name, {
          name: sym.name,
          kind: 'symbol',
          targetSymbolId: sym.id,
          targetSymbol: sym
        });
      } else if (!sym.id.includes('.')) {
        // 顶层函数（ID 中不含 '.'）
        scope.set(sym.name, {
          name: sym.name,
          kind: 'symbol',
          targetSymbolId: sym.id,
          targetSymbol: sym
        });
      }
    }

    // 2. 所有导入项映射
    for (const imp of fileResult.imports) {
      const targetFile = this.resolveModuleFilePath(filePath, imp);

      if (imp.isWildcard) {
        if (targetFile) {
          const targetRes = this.parseResults.get(targetFile);
          if (targetRes) {
            for (const sym of targetRes.symbols) {
              if (sym.isExported && !scope.has(sym.name)) {
                scope.set(sym.name, {
                  name: sym.name,
                  kind: 'symbol',
                  targetSymbolId: sym.id,
                  targetSymbol: sym
                });
              }
            }
          }
        }
        continue;
      }

      // 处理 from x import y [as z]
      if (imp.importedSymbol) {
        const localAlias = imp.alias || imp.importedSymbol;

        if (targetFile) {
          const targetRes = this.parseResults.get(targetFile);
          const targetSym = targetRes?.symbols.find(s => s.name === imp.importedSymbol);

          if (targetSym) {
            scope.set(localAlias, {
              name: localAlias,
              kind: 'symbol',
              targetSymbolId: targetSym.id,
              targetSymbol: targetSym
            });
            continue;
          }

          // 如果 targetFile 本身就是由 importedSymbol 构成的模块文件
          if (targetFile.endsWith(`/${imp.importedSymbol}.py`)) {
            scope.set(localAlias, {
              name: localAlias,
              kind: 'module',
              targetFilePath: targetFile
            });
            continue;
          }
        }
      }

      // 处理 import a.b as c
      if (imp.moduleName && !imp.importedSymbol) {
        const localAlias = imp.alias || imp.moduleName.split('.').pop()!;
        if (targetFile) {
          scope.set(localAlias, {
            name: localAlias,
            kind: 'module',
            targetFilePath: targetFile
          });
        }
      }
    }

    return scope;
  }

  /**
   * 为全部文件预先建立 LocalScope 映射
   */
  private buildAllLocalScopes(): void {
    for (const filePath of this.parseResults.keys()) {
      const scope = this.buildLocalScopeForFile(filePath);
      this.localScopes.set(filePath, scope);
    }
  }

  /**
   * 获取某类的所有祖先基类类节点（按继承层级递归查找）
   */
  private getAncestorClasses(classNode: ClassNode): ClassNode[] {
    const ancestors: ClassNode[] = [];
    const visited = new Set<string>();

    const queue: ClassNode[] = [classNode];
    visited.add(classNode.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const scope = this.localScopes.get(current.filePath);

      for (const baseName of current.bases) {
        let baseClass: ClassNode | undefined;

        // 尝试从类所在文件的 localScope 解析基类
        const item = scope?.get(baseName);
        if (item?.kind === 'symbol' && item.targetSymbol?.kind === 'class') {
          baseClass = item.targetSymbol as ClassNode;
        } else {
          // 查找同文件定义
          const localSym = this.symbolsByFilePath.get(current.filePath)?.get(baseName);
          if (localSym?.kind === 'class') {
            baseClass = localSym as ClassNode;
          } else {
            // 全局名称查找
            const matches = this.classesByName.get(baseName);
            if (matches && matches.length === 1) {
              baseClass = matches[0];
            }
          }
        }

        if (baseClass && !visited.has(baseClass.id)) {
          visited.add(baseClass.id);
          ancestors.push(baseClass);
          queue.push(baseClass);
        }
      }
    }

    return ancestors;
  }

  /**
   * 在类及其祖先基类中查找指定方法
   */
  private findMethodInClassHierarchy(
    classNode: ClassNode,
    methodName: string
  ): FunctionNode | undefined {
    // 1. 查找当前类自身方法
    const selfMethodId = `${classNode.id}.${methodName}`;
    const selfMethod = this.allSymbolsById.get(selfMethodId);
    if (selfMethod && selfMethod.kind !== 'class') {
      return selfMethod as FunctionNode;
    }

    // 2. 查找祖先基类方法
    const ancestors = this.getAncestorClasses(classNode);
    for (const ancestor of ancestors) {
      const ancestorMethodId = `${ancestor.id}.${methodName}`;
      const ancestorMethod = this.allSymbolsById.get(ancestorMethodId);
      if (ancestorMethod && ancestorMethod.kind !== 'class') {
        return ancestorMethod as FunctionNode;
      }
    }

    return undefined;
  }

  /**
   * 跨文件消歧核心算法：将 Call Sites 中的 calleeName 映射到全局唯一 SymbolNode
   */
  public resolveCallee(
    calleeName: string,
    callerSymbolId: string,
    callerFilePath: string
  ): SymbolNode | undefined {
    const callerSymbol = this.allSymbolsById.get(callerSymbolId);
    const scope = this.localScopes.get(callerFilePath);

    // 获取 caller 所在的类（如果有）
    let callerClass: ClassNode | undefined;
    if (callerSymbol && 'parentClassId' in callerSymbol && callerSymbol.parentClassId) {
      const parent = this.allSymbolsById.get(callerSymbol.parentClassId);
      if (parent && parent.kind === 'class') {
        callerClass = parent as ClassNode;
      }
    }

    // 场景 1: super().__init__ 或 super().methodName
    if (calleeName.startsWith('super().') && callerClass) {
      const methodName = calleeName.slice('super().'.length);
      const ancestors = this.getAncestorClasses(callerClass);
      for (const ancestor of ancestors) {
        const method = this.findMethodInClassHierarchy(ancestor, methodName);
        if (method) return method;
      }
      return undefined;
    }

    // 场景 2: self.methodName 或 cls.methodName
    if ((calleeName.startsWith('self.') || calleeName.startsWith('cls.')) && callerClass) {
      const methodName = calleeName.split('.')[1];
      const method = this.findMethodInClassHierarchy(callerClass, methodName);
      if (method) return method;
    }

    // 场景 3: receiver.methodName (例如 user.validate_email, order.mark_as_paid, processor.execute_payment)
    if (calleeName.includes('.')) {
      const parts = calleeName.split('.');
      const receiver = parts[0];
      const methodName = parts.slice(1).join('.');

      // 3.1: 检查 receiver 是否是导入的模块别名 (例如 calculator.calculate_tax)
      const moduleItem = scope?.get(receiver);
      if (moduleItem?.kind === 'module' && moduleItem.targetFilePath) {
        const modRes = this.parseResults.get(moduleItem.targetFilePath);
        const modSym = modRes?.symbols.find(s => s.name === methodName);
        if (modSym) return modSym;
      }

      // 3.2: 尝试从 caller 的函数体内推导 receiver 变量对应的 Class
      let inferredClass: ClassNode | undefined;

      // 3.2.1: 从函数参数类型注解查找
      if (callerSymbol && 'parameters' in callerSymbol) {
        const param = callerSymbol.parameters.find(p => p.name === receiver);
        if (param?.typeHint) {
          const typeName = param.typeHint.trim();
          const scopeItem = scope?.get(typeName);
          if (scopeItem?.kind === 'symbol' && scopeItem.targetSymbol?.kind === 'class') {
            inferredClass = scopeItem.targetSymbol as ClassNode;
          } else {
            const matches = this.classesByName.get(typeName);
            if (matches && matches.length === 1) {
              inferredClass = matches[0];
            }
          }
        }
      }

      // 3.2.2: 从当前 caller 源码文本中查找形如 `receiver = ClassName(...)` 的实例化模式
      if (!inferredClass && callerSymbol) {
        const fileContent = this.parseResults.get(callerFilePath);
        if (fileContent) {
          // 利用 callSites 中的同行/上下文做实例化查找
          const sameCallerCalls = fileContent.callSites.filter(
            c => c.callerSymbolId === callerSymbolId
          );
          let fallbackClass: ClassNode | undefined;
          for (const call of sameCallerCalls) {
            const scopeMatch = scope?.get(call.calleeName);
            if (scopeMatch?.kind === 'symbol' && scopeMatch.targetSymbol?.kind === 'class') {
              const targetClass = scopeMatch.targetSymbol as ClassNode;
              // 验证是否包含该方法
              const testMethod = this.findMethodInClassHierarchy(targetClass, methodName);
              if (testMethod) {
                // 优先根据变量名与类名相似度匹配 (例如 user -> User, processor -> PaymentProcessor)
                const recLower = receiver.toLowerCase();
                const classLower = targetClass.name.toLowerCase();
                if (classLower.includes(recLower) || recLower.includes(classLower)) {
                  inferredClass = targetClass;
                  break;
                }
                if (!fallbackClass) {
                  fallbackClass = targetClass;
                }
              }
            }
          }
          if (!inferredClass) {
            inferredClass = fallbackClass;
          }
        }
      }

      if (inferredClass) {
        const method = this.findMethodInClassHierarchy(inferredClass, methodName);
        if (method) return method;
      }

      // 3.3: 回退机制：在当前文件中所有导入的类中寻找拥有 methodName 的类
      if (scope) {
        for (const item of scope.values()) {
          if (item.kind === 'symbol' && item.targetSymbol?.kind === 'class') {
            const candidate = this.findMethodInClassHierarchy(
              item.targetSymbol as ClassNode,
              methodName
            );
            if (candidate) return candidate;
          }
        }
      }

      // 3.4: 全局工作区唯一方法名回退
      const matchingMethods: FunctionNode[] = [];
      for (const sym of this.allSymbolsById.values()) {
        if (sym.name === methodName && sym.id.includes('.')) {
          matchingMethods.push(sym as FunctionNode);
        }
      }
      if (matchingMethods.length === 1) {
        return matchingMethods[0];
      }

      return undefined;
    }

    // 场景 4: 独立标识符 (例如 User, calculate_discount, checkout_order, PaymentProcessor)
    // 4.1: 从 caller 所在文件的 localScope 查找
    const scopeItem = scope?.get(calleeName);
    if (scopeItem?.kind === 'symbol' && scopeItem.targetSymbol) {
      return scopeItem.targetSymbol;
    }

    // 4.2: 查找同文件内部符号
    const localSym = this.symbolsByFilePath.get(callerFilePath)?.get(calleeName);
    if (localSym) {
      return localSym;
    }

    // 4.3: 全局工作区唯一消歧（若全工作区仅有一个同名类或函数）
    const classes = this.classesByName.get(calleeName);
    if (classes && classes.length === 1) {
      return classes[0];
    }
    const funcs = this.functionsByName.get(calleeName);
    if (funcs && funcs.length === 1) {
      return funcs[0];
    }

    return undefined;
  }

  /**
   * 生成所有拓扑关系边 (calls | instantiates | contains | inherits)
   */
  public generateRelationEdges(): RelationEdge[] {
    const edgesMap = new Map<string, RelationEdge>();

    const addEdge = (edge: RelationEdge) => {
      if (!edgesMap.has(edge.id)) {
        edgesMap.set(edge.id, edge);
      }
    };

    // 1. 生成 contains 边 (类包含方法)
    for (const sym of this.allSymbolsById.values()) {
      if (sym.kind === 'class') {
        const classNode = sym as ClassNode;
        for (const methodId of classNode.methods) {
          const edgeId = `${classNode.id}->[contains]->${methodId}`;
          addEdge({
            id: edgeId,
            source: classNode.id,
            target: methodId,
            kind: 'contains'
          });
        }
      }
    }

    // 2. 生成 inherits 边 (类继承基类)
    for (const sym of this.allSymbolsById.values()) {
      if (sym.kind === 'class') {
        const classNode = sym as ClassNode;
        const scope = this.localScopes.get(classNode.filePath);

        for (const baseName of classNode.bases) {
          let baseClass: ClassNode | undefined;

          const item = scope?.get(baseName);
          if (item?.kind === 'symbol' && item.targetSymbol?.kind === 'class') {
            baseClass = item.targetSymbol as ClassNode;
          } else {
            const local = this.symbolsByFilePath.get(classNode.filePath)?.get(baseName);
            if (local?.kind === 'class') {
              baseClass = local as ClassNode;
            } else {
              const matches = this.classesByName.get(baseName);
              if (matches && matches.length === 1) {
                baseClass = matches[0];
              }
            }
          }

          if (baseClass) {
            const edgeId = `${classNode.id}->[inherits]->${baseClass.id}`;
            addEdge({
              id: edgeId,
              source: classNode.id,
              target: baseClass.id,
              kind: 'inherits'
            });
          }
        }
      }
    }

    // 3. 生成 calls 与 instantiates 边
    for (const [filePath, fileResult] of this.parseResults.entries()) {
      for (const call of fileResult.callSites) {
        // 忽略 caller 为空或无法识别的情况
        if (!call.callerSymbolId) continue;

        try {
          const target = this.resolveCallee(call.calleeName, call.callerSymbolId, filePath);
          if (!target) continue;

          // 记录代码中实际调用与引用位置 (包含顶层脚本与函数内调用)
          const isTopLevel = call.callerSymbolId.includes('<module>') || call.callerSymbolId.includes('<top_level>');
          const callerSym = this.allSymbolsById.get(call.callerSymbolId);
          const fileName = filePath.split('/').pop() || filePath;
          const callerName = callerSym ? callerSym.name : `${fileName} (顶层脚本)`;

          target.usages = target.usages || [];
          const isDup = target.usages.some(
            u => u.filePath === filePath && u.line === call.line && u.column === call.column
          );
          if (!isDup) {
            target.usages.push({
              callerSymbolId: call.callerSymbolId,
              callerName,
              filePath,
              line: call.line,
              column: call.column,
              callSnippet: call.calleeName,
              isTopLevelScript: isTopLevel
            });
            target.usageCount = target.usages.length;
          }

          // 如果调用目标是 Class，关系种类为 'instantiates'；否则为 'calls'
          const kind: EdgeKind = target.kind === 'class' ? 'instantiates' : 'calls';
          const edgeId = `${call.callerSymbolId}->[${kind}]->${target.id}`;

          addEdge({
            id: edgeId,
            source: call.callerSymbolId,
            target: target.id,
            kind,
            callSite: {
              line: call.line,
              column: call.column
            }
          });
        } catch {
          continue;
        }
      }
    }

    // 3.5 为顶层脚本执行流 (scriptPipeline) 解析目标 Symbol ID
    for (const [filePath, fileResult] of this.parseResults.entries()) {
      if (fileResult.scriptPipeline && fileResult.scriptPipeline.length > 0) {
        for (const step of fileResult.scriptPipeline) {
          try {
            const target = this.resolveCallee(step.calleeName, `${filePath}#<module>`, filePath);
            if (target) {
              step.targetSymbolId = target.id;
            }
          } catch {
            // ignore
          }
        }
      }
    }

    const allEdges = Array.from(edgesMap.values());

    // 4. 孤立死代码检测标记 (Dead Code Radar)
    this.markDeadCodeCandidates(allEdges);

    return allEdges;
  }

  /**
   * 根据调用链路拓扑入度标记孤立死代码候选 (Dead Code Candidates)
   */
  private markDeadCodeCandidates(edges: RelationEdge[]): void {
    const inDegreeMap = new Map<string, number>();

    for (const sym of this.allSymbolsById.values()) {
      inDegreeMap.set(sym.id, 0);
    }

    for (const edge of edges) {
      if (edge.kind === 'calls' || edge.kind === 'instantiates' || edge.kind === 'inherits') {
        const count = inDegreeMap.get(edge.target) || 0;
        inDegreeMap.set(edge.target, count + 1);
      }
    }

    // 统计来自模块级顶级调用的引用 (例如入口 if __name__ == '__main__': start_application())
    for (const [filePath, fileResult] of this.parseResults.entries()) {
      for (const call of fileResult.callSites) {
        if (call.callerSymbolId.endsWith('#<module>')) {
          const target = this.resolveCallee(call.calleeName, call.callerSymbolId, filePath);
          if (target) {
            const count = inDegreeMap.get(target.id) || 0;
            inDegreeMap.set(target.id, count + 1);
          }
        }
      }
    }

    for (const sym of this.allSymbolsById.values()) {
      // 豁免类构造函数与 Python 内置双下划线魔法方法
      if (sym.name.startsWith('__') && sym.name.endsWith('__')) {
        sym.isDeadCodeCandidate = false;
        continue;
      }

      const inDegree = inDegreeMap.get(sym.id) || 0;
      const totalUsages = (sym.usages && sym.usages.length > 0) ? sym.usages.length : 0;

      // 如果没有任何函数/模块调用或继承该实体，且没有任何使用记录，标记为死代码候选
      if (inDegree === 0 && totalUsages === 0) {
        sym.isDeadCodeCandidate = true;
      } else {
        sym.isDeadCodeCandidate = false;
      }
    }
  }
}

/**
 * 跨文件消歧与调用图谱生成主入口函数
 *
 * @param parseResults 工作区所有 Python 文件的解析结果 Map
 * @returns 生成的全工作区 RelationEdge 列表
 */
export function resolveImportsAndRelations(
  parseResults: Map<string, FileParseResult>
): RelationEdge[] {
  const resolver = new ImportResolver(parseResults);
  return resolver.generateRelationEdges();
}

/**
 * 提取工作区中所有具有顶层可执行逻辑的独立脚本文件集合
 */
export function getScriptEntries(parseResults: Map<string, FileParseResult>): Set<string> {
  const set = new Set<string>();
  for (const [filePath, res] of parseResults.entries()) {
    if (res.isScriptEntry) {
      set.add(filePath);
    }
  }
  return set;
}

/**
 * 提取工作区中各文件的顶层脚本调用流步骤
 */
export function getScriptPipelines(parseResults: Map<string, FileParseResult>): Map<string, import('../types').ScriptPipelineStep[]> {
  const map = new Map<string, import('../types').ScriptPipelineStep[]>();
  for (const [filePath, res] of parseResults.entries()) {
    if (res.scriptPipeline && res.scriptPipeline.length > 0) {
      map.set(filePath, res.scriptPipeline);
    }
  }
  return map;
}
