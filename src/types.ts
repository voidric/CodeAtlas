/**
 * CodeAtlas 统一类型定义与协议契约
 */

export type SymbolKind = 
  | 'function' 
  | 'async_function' 
  | 'method' 
  | 'class_method' 
  | 'static_method' 
  | 'class';

export interface SourceRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface DocstringParam {
  name: string;
  type?: string;
  description: string;
}

export interface DocstringInfo {
  summary: string;
  description?: string;
  params?: Record<string, string>;
  returns?: string;
  isAiGenerated?: boolean;
}

export interface Parameter {
  name: string;
  typeHint?: string;
  defaultValue?: string;
  kind: 'positional' | 'keyword' | 'args' | 'kwargs';
}

export interface UsageSite {
  callerSymbolId: string;       // 调用者 ID (若是顶层脚本则是 "${filePath}#<top_level>")
  callerName: string;           // 调用者展示名 (如 "PGD_batch.py (脚本顶层)" 或 "train_model")
  filePath: string;             // 调用发生文件
  line: number;                 // 调用发生行号
  column: number;               // 调用发生列号
  callSnippet?: string;         // 调用表达式 (如 "denormalize(img)")
  isTopLevelScript: boolean;    // 是否为模块顶层脚本调用
}

export interface BaseSymbolNode {
  id: string;                      // 唯一ID: "${filePath}#${symbolName}" 或 "${filePath}#${className}.${methodName}"
  name: string;                    // 实体名称
  filePath: string;                // 相对工作区根目录文件路径 (统一使用正斜杠 '/')
  range: SourceRange;              // 实体在源码中的起止位置
  decorators: string[];            // 装饰器列表
  docstring?: DocstringInfo;       // 结构化文档信息
  isExported: boolean;             // 是否作为模块接口导出
  isDeadCodeCandidate: boolean;    // 是否为孤立死代码候选
  usages?: UsageSite[];            // 全工作区使用位置列表 (含函数内与顶层脚本调用)
  usageCount?: number;             // 被引用与调用总次数
}

export interface FunctionNode extends BaseSymbolNode {
  kind: 'function' | 'async_function' | 'method' | 'class_method' | 'static_method';
  parentClassId?: string;          // 若为类内部方法，指向所在类的 ID
  parameters: Parameter[];         // 形参契约列表
  returnType?: string;             // 出参显式注解或字面量推导
}

export interface ClassNode extends BaseSymbolNode {
  kind: 'class';
  bases: string[];                 // 基类名称或ID列表
  methods: string[];               // 包含的成员方法 ID 列表
}

export type SymbolNode = FunctionNode | ClassNode;

export type EdgeKind = 'calls' | 'contains' | 'inherits' | 'instantiates';

export interface RelationEdge {
  id: string;                      // 唯一ID: "${source}->[${kind}]->${target}"
  source: string;                  // Source SymbolNode ID
  target: string;                  // Target SymbolNode ID
  kind: EdgeKind;                  // 关系种类
  callSite?: {
    line: number;
    column: number;
  };
}

export interface CallSiteInfo {
  calleeName: string;              // 调用的符号名称 (如 foo, models.User, self.bar)
  line: number;
  column: number;
  callerSymbolId: string;          // 发生调用的外层函数或方法 ID
}

export interface FileParseResult {
  filePath: string;
  symbols: SymbolNode[];
  imports: FileImport[];
  callSites: CallSiteInfo[];
  hasTopLevelExecution?: boolean;        // 是否包含顶层实质性执行代码 (而非单纯 def/import)
  isScriptEntry?: boolean;               // 是否为可直接运行的独立脚本入口
  scriptPipeline?: ScriptPipelineStep[]; // 顶层直接运行的代码步骤流
  docstring?: DocstringInfo;             // 文件级架构描述或文档
}

export interface FileImport {
  raw: string;
  moduleName?: string;             // 例如: 'app.services.order'
  importedSymbol?: string;         // 例如: 'create_order'
  alias?: string;                  // 例如: 'order_fn'
  isWildcard?: boolean;            // 是否为 from x import *
  isRelative?: boolean;            // 是否为相对导入
  level?: number;                  // 相对导入层级 (点数量)
}

/**
 * Ego Graph 局部聚焦拓扑数据契约
 */
export interface EgoNeighbor {
  node: SymbolNode;
  edge: RelationEdge;
}

export interface EgoGraphData {
  center: SymbolNode;
  predecessors: EgoNeighbor[];     // 入度邻居 (向中心发出的边：调用者、包含当前方法的类、子类、实例化者)
  successors: EgoNeighbor[];       // 出度邻居 (从中心发出的边：被调用者、所属基类、类包含的方法、调用的类)
  allNodes: SymbolNode[];
  allEdges: RelationEdge[];
}

/**
 * 架构资产树节点契约 (按工作区/文件夹/文件/类/函数组织)
 */
export interface ScriptPipelineStep {
  step: number;
  line: number;
  calleeName: string;
  callSnippet?: string;
  targetSymbolId?: string;
}

export interface ArchitectureTreeNode {
  id: string;                      // 树节点唯一标识
  name: string;                    // 展示名称 (文件夹名, 文件名, 类名, 函数名)
  kind: 'folder' | 'file' | 'class' | 'function' | 'method';
  filePath: string;                // 相对工程根目录文件路径
  symbolId?: string;               // 若为类、函数、方法，关联的 SymbolNode ID
  range?: SourceRange;             // 源码行号范围
  returnType?: string;             // 返回类型
  isDeadCodeCandidate?: boolean;   // 是否为孤立死代码候选
  isScriptEntry?: boolean;         // 是否为独立可直接运行的脚本入口
  docSummary?: string;             // 一句话功能文档
  scriptPipeline?: ScriptPipelineStep[]; // 脚本顶层执行步骤
  stats: {
    totalClasses: number;          // 包含的类总数
    totalFunctions: number;        // 包含的函数总数
    deadCodeCount: number;         // 包含的孤立死代码总数
  };
  children: ArchitectureTreeNode[];// 子节点
}

/**
 * 宏观全貌架构拓扑数据契约 (支持按模块/包或按文件拓扑)
 */
export interface MacroModuleNode {
  id: string;                      // 模块或文件 ID (如 "services" 或 "scripts/PGD_batch.py")
  name: string;                    // 模块或文件名称
  path: string;                    // 相对路径
  kind?: 'package' | 'file';       // 节点类型：包还是具体文件
  isScriptEntry?: boolean;         // 是否为直接执行的脚本入口
  symbolCount: number;             // 包含的符号数量
  functionCount: number;           // 包含的函数数量
  classCount: number;              // 包含的类数量
}

export interface MacroRelationEdge {
  id: string;
  source: string;                  // Source Module/File ID
  target: string;                  // Target Module/File ID
  callWeight: number;              // 跨模块/文件调用次数权重
  sampleCalls: Array<{ caller: string; callee: string }>;
}

export interface MacroGraphData {
  modules: MacroModuleNode[];
  edges: MacroRelationEdge[];
}

/**
 * Webview <-> Extension Host 通信协议
 */
export type WebviewToHostMessage = 
  | { type: 'WEBVIEW_READY' }
  | { type: 'FOCUS_NODE'; symbolId: string }
  | { type: 'JUMP_TO_CODE'; symbolId: string }
  | { type: 'JUMP_TO_LOCATION'; filePath: string; line: number; column?: number }
  | { type: 'REQUEST_REFRESH' }
  | { type: 'REQUEST_MACRO_GRAPH' }
  | { type: 'REQUEST_HIERARCHY_TREE' }
  | { type: 'SEARCH'; query: string }
  | { type: 'FIND_PATH'; fromSymbolId: string; toSymbolId: string }
  | { type: 'GENERATE_AI_DOC'; symbolId: string }
  | { type: 'GENERATE_FILE_AI_DOC'; filePath: string }
  | { type: 'GENERATE_FOLDER_AI_DOC'; folderPath: string }
  | { type: 'GENERATE_PROJECT_AI_DOC' }
  | { type: 'START_WORKSPACE_ANALYSIS'; scope?: { mode: 'all' | 'folder' | 'file'; targetPath?: string } }
  | { type: 'CANCEL_WORKSPACE_ANALYSIS' }
  | { type: 'SAVE_CONFIG'; config: { endpoint: string; apiKey?: string; selectedModel: string; enableIncrementalCache: boolean } }
  | { type: 'TEST_CONNECTION'; config: { endpoint: string; apiKey?: string; selectedModel: string } }
  | { type: 'CLEAR_CACHE' }
  | { type: 'EXPORT_MARKDOWN_DOC' };

export interface SearchCandidateItem {
  id: string;
  name: string;
  kind: string;
  filePath: string;
  line: number;
  score: number;
  matchedReason: string;
  summary: string;
  isDeadCodeCandidate: boolean;
  signature?: string;
}

export type HostToWebviewMessage =
  | { type: 'SET_EGO_GRAPH'; data: EgoGraphData }
  | { type: 'SET_HIERARCHY_TREE'; tree: ArchitectureTreeNode[] }
  | { type: 'SET_MACRO_GRAPH'; data: MacroGraphData }
  | { type: 'SET_STATUS'; status: string; totalSymbols: number; totalEdges: number }
  | { type: 'SET_SEARCH_RESULTS'; query: string; results: SearchCandidateItem[] }
  | { type: 'HIGHLIGHT_PATH'; pathNodes: string[]; pathEdges: string[] }
  | { type: 'UPDATE_AI_DOC'; symbolId: string; summary: string }
  | { type: 'UPDATE_FILE_AI_DOC'; filePath: string; summary: string }
  | { type: 'UPDATE_FOLDER_AI_DOC'; folderPath: string; summary: string }
  | { type: 'UPDATE_PROJECT_AI_DOC'; summary: string }
  | { type: 'SET_BATCH_PROGRESS'; current: number; total: number; currentItem: string; isRunning: boolean }
  | { type: 'SET_OLLAMA_STATUS'; isConnected: boolean; modelName: string | null }
  | { type: 'SET_CONFIG'; config: { endpoint: string; apiKey?: string; selectedModel: string; enableIncrementalCache: boolean; cacheStats?: { totalCachedFiles: number; totalCachedSymbols: number } } }
  | { type: 'TEST_CONNECTION_RESULT'; success: boolean; message: string }
  | { type: 'ERROR'; message: string };

