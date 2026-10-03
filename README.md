# CodeAtlas Architecture

面向 Python / TypeScript / JavaScript 的代码拓扑分析、架构可视化与模型上下文协议 (MCP) 扩展。

基于抽象语法树 (AST) 与有向图拓扑引擎，提供四层架构透镜、端到端调用链寻路、孤立死代码检测及标准 Stdio MCP 服务，支持与 VS Code 编辑器双向光标联动，并可作为 AI Agent 的底层代码上下文基础设施。

---

## 核心特性

### 1. 多语言语法提取与拓扑建模

* **Python 深度分析**: 提取函数、类、类方法、装饰器、类型注解、Docstring（Google / Sphinx / 单行），解析相对与绝对导入及模块级脚本执行流。
* **TypeScript / JavaScript 分析**: 基于官方 TypeScript Compiler API，解析 TS/JS/TSX/JSX 的类、函数、箭头函数、接口与 `import/export` 依赖。
* **有向拓扑图引擎**: 基于 `graphology` 统一构建拓扑结构，自动生成 `calls`（调用）、`instantiates`（实例化）、`inherits`（继承）、`contains`（内部包含）四类语义依赖边。

### 2. 四层架构透镜

* **Layer 1: 全工程资产大报告**: 统计全项目文件、实体、依赖关系总数，输出模块依赖拓扑与复杂度分布，支持导出为 Markdown 报告。
* **Layer 2: 目录模块领域综述**: 聚合子目录架构边界，可视化分析跨模块进出依赖契约。
* **Layer 3: 文件契约大纲**: 列举文件内部导出的函数、类、接口及其类型签名。
* **Layer 4: 局部辐射拓扑图 (Ego Graph)**: 以指定符号为核心，展示直接调用者 (Incoming Callers) 与被依赖项 (Outgoing Callees)，支持动态深度辐射。

### 3. 静态调用链追踪与死代码雷达

* **端到端调用链寻路 (PathFinder)**: 采用广度优先搜索 (BFS) 遍历跨文件静态调用链路，计算跳数并输出有序调用链，在画布中高亮流动路径。
* **孤立死代码雷达 (DeadCodeDetector)**: 识别代码库中零外部引用、零调用者的孤立顶层函数与类候选，辅助技术债务清理。

### 4. 混合条件检索

* **语法特征过滤**: 支持通过语法表达式精确检索，如 `in:float out:dict`（入参含 float 且返回 dict）、`kind:class`。
* **双模态召回**: 结合本地拼音前缀索引与词法分析，并支持可选的本地大模型意图改写。

### 5. 双模态界面与光标双向联动

* **双视图模式**:
  * 活动栏侧边栏视图 (`codeatlas.mainView`)：轻量跟随时时查看当前上下文。
  * 独立编辑器标签页全屏画布 (`codeatlas.openWebviewPanel`)：大屏全景架构研读。
* **编辑器光标联动**: 在编辑代码时，以 250ms 防抖自动在图谱中聚焦光标所在实体的 Ego Graph；点击图谱节点即刻跳转至对应源码位置。

### 6. 本地大模型推导

* 兼容 OpenAI API 规范及本地 Ollama 服务（默认 `qwen2.5-coder:7b`），0 额外 Token 消耗。
* 支持后台异步补齐无注释函数的业务摘要并写入持久化缓存，不修改用户源码。

### 7. 原生 MCP 服务支持

* 内置符合 MCP 2024-11-05 规范的 Stdio JSON-RPC 2.0 服务端。
* 为外部 AI Agent（Antigravity、Cursor、Codex、Claude Desktop 等）提供无幻觉的静态拓扑切片查询与寻路能力。

---

## 安装方法

### 方式一：从 VS Code Marketplace 安装 (推荐)

插件发布至 Visual Studio Marketplace 后，可在 VS Code 扩展商店搜索 `CodeAtlas` 或通过命令行直接安装：

```bash
code --install-extension voidric.codeatlas-architecture
```

### 方式二：从 VSIX 离线包安装

1. 获取编译生成的 `codeatlas-architecture-0.1.0.vsix` 文件。
2. 打开 VS Code / Cursor，按 `Ctrl+Shift+P` (macOS: `Cmd+Shift+P`) 打开命令面板。
3. 输入并选择 `Extensions: Install from VSIX...`。
4. 选择对应的 `.vsix` 文件完成安装。

---

## 常用命令与操作入口

| 命令标识                       | 命令名称                            | 入口位置                                  |
| :----------------------------- | :---------------------------------- | :---------------------------------------- |
| `codeatlas.openWebviewPanel` | CodeAtlas: 在独立标签页打开全景面板 | 活动栏视图标题栏 / 命令面板               |
| `codeatlas.showInGraph`      | CodeAtlas: 在图谱中聚焦当前实体     | 编辑器右键上下文菜单 (`editor/context`) |
| `codeatlas.refresh`          | CodeAtlas: 重新扫描工作区           | 活动栏视图标题栏 / 命令面板               |

---

## MCP 服务配置 (AI Agent 对接)

CodeAtlas 提供了完全独立的 Stdio MCP 入口脚本：`out/mcpEntry.js`。

### 暴露的标准 MCP 工具清单

| 工具名称                    | 功能描述                                                   | 核心输入参数                                              |
| :-------------------------- | :--------------------------------------------------------- | :-------------------------------------------------------- |
| `get_symbol_context`      | 获取指定符号的参数、返回值、调用者、依赖项及 Markdown 契约 | `symbolId`: 全局符号 ID (格式: `filePath#symbolName`) |
| `trace_call_path`         | 查找两个符号之间的静态调用链最短路径 (BFS)                 | `fromSymbol`, `toSymbol`                              |
| `search_codebase_symbols` | 检索代码库中的函数与类，支持`in:Type out:Type` 语法过滤  | `query`, `limit` (默认 10)                            |
| `get_dead_code_report`    | 扫描项目中零外部引用的孤立死函数与废弃类候选               | `limit` (默认 20)                                       |
| `call_local_llm`          | 调用本地 Ollama/OpenAI 模型执行推导（0 Token 消耗）        | `prompt`, `model`, `endpoint`                       |
| `batch_local_llm`         | 并发批量调用本地模型处理多个文本/代码片段                  | `prompts`, `model`, `endpoint`                      |

### 客户端接入配置示例

#### 1. Cursor (`.cursor/mcp.json` 或全局 MCP 设置)

```json
{
  "mcpServers": {
    "codeatlas": {
      "command": "node",
      "args": ["<插件安装路径>/out/mcpEntry.js", "<目标工作区绝对路径>"]
    }
  }
}
```

#### 2. Antigravity / Claude Desktop (`~/.gemini/config/mcp_config.json`)

```json
{
  "mcpServers": {
    "codeatlas": {
      "command": "node",
      "args": ["D:/CodeAtlas Architecture/out/mcpEntry.js", "D:/CodeAtlas Architecture"],
      "env": {}
    }
  }
}
```

*注：若省略第二个路径参数，MCP Server 默认以启动当前工作目录 (CWD) 或插件根目录作为分析基准。*

---

## 配置选项参考

在 VS Code `settings.json` 中可配置以下项目：

| 配置项                               |  类型  |                                        默认值                                        | 详细说明                                       |
| :----------------------------------- | :-----: | :----------------------------------------------------------------------------------: | :--------------------------------------------- |
| `codeatlas.scanOnStartup`          | boolean |                                       `true`                                       | 工作区打开时是否自动执行全量语法分析并构建图谱 |
| `codeatlas.cursorDebounceMs`       | number |                                       `250`                                       | 编辑器光标移动触发图谱聚焦的防抖延迟（毫秒）   |
| `codeatlas.ignoreDirs`             |  array  | `[".venv", "venv", "__pycache__", ".git", "node_modules", "dist", "out", "build"]` | 扫描构建图谱时忽略的目录匹配列表               |
| `codeatlas.llmEndpoint`            | string |                           `"http://127.0.0.1:11434/v1"`                           | 本地大模型接口地址 Base URL (兼容 OpenAI 规范) |
| `codeatlas.apiKey`                 | string |                                        `""`                                        | 模型 API 密钥 (本地 Ollama 服务可留空)         |
| `codeatlas.selectedModel`          | string |                                `"qwen2.5-coder:7b"`                                | 指定用于架构摘要推导的模型标识                 |
| `codeatlas.enableIncrementalCache` | boolean |                                       `true`                                       | 是否启用基于文件内容哈希 (MD5) 的增量扫描缓存  |

---

## 本地开发与发布

### 环境准备

* Node.js >= 18.0.0
* VS Code >= 1.85.0

### 构建与测试指令

```bash
# 1. 安装开发依赖
npm install

# 2. 编译 TypeScript 代码
npm run compile

# 3. 运行完整自动化测试套件 (包含四层架构验证、解析器单元测试与 MCP 协议测试)
npm test
node out/test/testPhase2.js
node out/test/testMcpCapability.js

# 4. 打包为 VSIX 离线安装包
npm run package

# 5. 发布到 VS Code Marketplace (需配置个人访问令牌 PAT)
npx @vscode/vsce publish
```

---

## 许可证

本项目采用 MIT License 开源许可协议。
