# CodeAtlas Architecture

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/voidric.codeatlas-architecture?label=Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=voidric.codeatlas-architecture)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0-green?logo=node.js)](https://nodejs.org/)

面向 Python、TypeScript 与 JavaScript 的交互式代码调用图谱与依赖关系分析工具，支持 VS Code 编辑器插件与通用 Stdio MCP (Model Context Protocol) 服务。

通过抽象语法树 (AST) 与有向拓扑图算法，在大型复杂代码库中提供多层级依赖大纲、静态调用链寻路、未引用死代码检测及编辑器双向光标跳转，并可作为 AI Coding Agent（如 Cursor、Antigravity、Claude Desktop）的结构化上下文基础设施。

---

## 核心功能

### 1. 交互式调用图谱与层级结构
* **多层级依赖大纲**：提供项目整体概览、目录模块边界、单文件导出定义、底层函数与类的方法级调用关系。
* **局部辐射拓扑 (Ego Graph)**：以任意指定函数或类为核心，动态展开其直接调用者（Callers）与被依赖项（Callees），支持自定义调用深度。
* **光标双向联动**：在编辑器中移动光标时，视图在 250ms 内自动聚焦至当前代码实体；点击图谱节点即刻跳转至对应源文件与代码行。

### 2. 静态调用链路径追踪 (BFS Path Finding)
* 基于广度优先搜索 (BFS) 遍历跨文件静态调用关系。
* 输入起点与终点符号，计算最短调用路径与跳数（Hops），并在图谱中按序高亮显示调用流向。

### 3. 未引用符号检测 (Dead Code Detection)
* 扫描工作区顶层函数与类，识别零外部引用、零调用者的潜在冗余代码候选。
* 辅助代码重构与技术债务排查。

### 4. 复合语法特征检索
* 支持通过函数参数类型与返回值类型进行精准语法过滤，如 `in:float out:dict`、`kind:class`。
* 结合本地拼音前缀索引与词法匹配，实现毫秒级符号定位。

### 5. 本地轻量模型辅助 (可选)
* 兼容本地 Ollama 与标准 OpenAI 规范接口（如 `qwen2.5-coder:7b`）。
* 在不改动用户源码的前提下，异步推导内部未注释函数的业务摘要，并持久化到本地工作区缓存中。

### 6. 原生 MCP 服务支持 (Model Context Protocol)
* 内置符合 MCP 规范的独立 Stdio 服务入口（`out/mcpEntry.js`）。
* 为外部 AI Agent 暴露静态拓扑切片查询与寻路工具，无需将全量源码输入模型上下文即可精准定位调用流。

---

## 支持语言

| 语言 | 扩展名 | 解析引擎 | 提取范围 |
| :--- | :--- | :--- | :--- |
| **Python** | `.py` | 静态 AST 解析 | 函数、类、类方法、装饰器、类型注解、Docstring、相对/绝对导入、模块级执行流 |
| **TypeScript** | `.ts`, `.tsx` | TypeScript Compiler API | 类、函数、箭头函数、接口、类型别名、`import/export` 关系 |
| **JavaScript** | `.js`, `.jsx` | TypeScript Compiler API | 函数、类、CommonJS / ES Module 导入导出 |

---

## 快速开始

### 方式一：从 VS Code Marketplace 安装

在 VS Code 扩展商店搜索 `CodeAtlas Architecture`，或使用命令行直接安装：

```bash
code --install-extension voidric.codeatlas-architecture
```

### 方式二：从 VSIX 离线包安装

1. 从 [Releases](https://github.com/voidric/CodeAtlas-Architecture/releases) 下载最新的 `codeatlas-architecture-x.x.x.vsix`；
2. 在 VS Code 中按 `Ctrl+Shift+P` (macOS: `Cmd+Shift+P`)；
3. 输入并选择 `Extensions: Install from VSIX...`，选中下载的文件即可完成安装。

---

## 常用命令与配置

### 命令列表

| 命令标识 | 显示名称 | 入口 |
| :--- | :--- | :--- |
| `codeatlas.showInGraph` | CodeAtlas: 在图谱中聚焦当前实体 | 编辑器右键上下文菜单 (`editor/context`) |
| `codeatlas.openWebviewPanel` | CodeAtlas: 打开代码拓扑全景图 | 活动栏视图标题栏 / 命令面板 |
| `codeatlas.refresh` | CodeAtlas: 重新扫描工作区 | 活动栏视图标题栏 / 命令面板 |

### 配置项 (`settings.json`)

```json
{
  "codeatlas.scanOnStartup": true,
  "codeatlas.cursorDebounceMs": 250,
  "codeatlas.ignoreDirs": [".git", "node_modules", "dist", "out", "build", "__pycache__", ".venv", "venv"],
  "codeatlas.llmEndpoint": "http://127.0.0.1:11434/v1",
  "codeatlas.selectedModel": "qwen2.5-coder:7b",
  "codeatlas.enableIncrementalCache": true
}
```

---

## 本地 MCP 服务接入 (AI Coding Agent 对接)

本项目的 `out/mcpEntry.js` 是一个完全独立的 Stdio MCP 服务入口，不需要依赖 VS Code 界面即可独立运行。

### 1. Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "codeatlas": {
      "command": "node",
      "args": ["<插件路径>/out/mcpEntry.js", "<项目路径>"]
    }
  }
}
```

### 2. Antigravity / Claude Desktop (`mcp_config.json`)
```json
{
  "mcpServers": {
    "codeatlas": {
      "command": "node",
      "args": ["<插件路径>/out/mcpEntry.js", "<项目路径>"]
    }
  }
}
```

### 暴露的标准 MCP 工具清单
* `get_symbol_context`：获取指定符号的参数、返回值、调用者、依赖项及接口定义。
* `trace_call_path`：计算两个符号之间的跨文件静态调用链最短路径 (BFS)。
* `search_codebase_symbols`：按名称及类型特征语法检索代码符号。
* `get_dead_code_report`：扫描项目中零外部引用的孤立符号候选。
* `call_local_llm` / `batch_local_llm`：通过本地大模型推导业务摘要。

---

## 本地开发与代码结构

### 环境要求
* Node.js >= 18.0.0
* VS Code >= 1.85.0
* TypeScript 5.3+

### 源码目录结构

```
CodeAtlas Architecture/
├── src/
│   ├── parser/         # 多语言语法解析引擎 (Python AST / TS Compiler API)
│   ├── graph/          # 有向图拓扑引擎、BFS 寻路算法与死代码检测
│   ├── search/         # 拼音与复合特征检索器
│   ├── ai/             # 标准 MCP 协议服务端与通用大模型客户端
│   ├── webview/        # 侧边栏与独立标签页前端渲染
│   └── extension.ts    # VS Code 扩展主入口与命令注册
├── docs/
│   └── MARKETPLACE_README.md  # 专供 VS Code Marketplace 的详情说明
├── package.json
└── tsconfig.json
```

### 构建与测试

```bash
# 1. 安装依赖
npm install

# 2. 编译 TypeScript
npm run compile

# 3. 运行自动化测试套件
npm test
node out/test/testPhase2.js
node out/test/testMcpCapability.js

# 4. 打包 VS Code 扩展
npm run package
```

### 调试扩展
在 VS Code 中直接按 `F5`，将启动全新的 Extension Development Host 调试窗口。

---

## 许可证

本项目采用 [MIT License](LICENSE) 开源协议。
