# CodeAtlas Architecture

面向 Python、TypeScript 与 JavaScript 的交互式代码调用图谱与依赖关系分析扩展，内置标准 MCP (Model Context Protocol) 服务。

通过静态抽象语法树 (AST) 解析与有向图算法，帮助开发者在大型代码库中快速梳理调用关系、排查遗留未使用符号、追踪跨文件调用链路，并为 AI 编程助手（Cursor、Antigravity、Claude Desktop 等）提供结构化代码上下文。

---

## 主要功能

### 1. 交互式调用图谱与层级结构
* **多层级分析**：支持从项目整体依赖、目录模块边界、单个文件接口，下钻到具体函数/类的方法级调用关系。
* **局部辐射图 (Ego Graph)**：选中任一函数或类，直观查看其直接调用者（Callers）与被依赖项（Callees），支持动态展开调用层深。
* **双向联动**：在编辑器中移动光标，侧边栏自动聚焦至当前代码符号；在画布中点击节点，即刻跳转定位到源文件对应行号。

### 2. 跨文件静态调用链追踪 (Path Finding)
* 基于有向图广度优先搜索 (BFS) 算法，输入起点与终点符号（或在图谱中右键选择），计算最短静态调用链路。
* 在图谱中高亮显示链路流动方向与跳数（Hops），辅助梳理复杂业务流转逻辑。

### 3. 未引用符号检测 (Unused Code Detection)
* 扫描工作区顶层函数与类定义，识别零外部引用、零调用者的潜在冗余代码候选。
* 辅助重构与清理历史技术债务。

### 4. 复合语法特征检索
* 支持通过参数类型与返回值类型进行精准语法过滤，例如 `in:float out:dict`、`kind:class`。
* 内置拼音前缀索引与快速符号召回。

### 5. 本地轻量模型辅助 (可选)
* 兼容本地 Ollama 或 OpenAI 兼容格式服务（如 `qwen2.5-coder:7b`）。
* 在不修改源文件的前提下，为无文档注释的内部符号推导业务摘要，并持久化到本地工作区缓存中。

### 6. 内置标准 MCP 服务 (AI Coding Agent 集成)
* 内置符合 MCP 规范的独立 Stdio 服务入口（`out/mcpEntry.js`）。
* 为外部 AI Agent 暴露静态拓扑切片查询与寻路工具，大幅减少大模型阅读全仓库代码时的上下文消耗与幻觉。

---

## 支持语言

| 语言 | 文件扩展名 | 解析引擎 |
| :--- | :--- | :--- |
| **Python** | `.py` | 静态 AST 解析（支持函数、类、装饰器、Docstring、相对/绝对导入及模块级入口） |
| **TypeScript** | `.ts`, `.tsx` | TypeScript Compiler API（支持类、函数、箭头函数、接口与模块导出） |
| **JavaScript** | `.js`, `.jsx` | TypeScript Compiler API 兼容解析模式 |

---

## 常用操作与命令

可通过 VS Code 命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`）或快捷入口使用：

| 命令标识 | 显示名称 | 说明 |
| :--- | :--- | :--- |
| `codeatlas.showInGraph` | CodeAtlas: 在图谱中聚焦当前实体 | 编辑器右键上下文菜单直接触发 |
| `codeatlas.openWebviewPanel` | CodeAtlas: 打开代码拓扑全景图 | 在独立编辑器标签页打开大屏全景画布 |
| `codeatlas.refresh` | CodeAtlas: 重新扫描工作区 | 手动重新遍历文件构建图谱 |

---

## 配置选项

在 VS Code 设置（`settings.json`）中可调整以下配置：

```json
{
  // 工作区打开时是否自动扫描代码构建图谱
  "codeatlas.scanOnStartup": true,

  // 编辑器光标移动触发图谱联动的防抖延迟（毫秒）
  "codeatlas.cursorDebounceMs": 250,

  // 扫描时忽略的目录匹配规则
  "codeatlas.ignoreDirs": [
    ".git",
    "node_modules",
    "dist",
    "out",
    "build",
    "__pycache__",
    ".venv",
    "venv"
  ],

  // 本地大模型接口 Base URL (可选，留空则仅使用纯静态分析)
  "codeatlas.llmEndpoint": "http://127.0.0.1:11434/v1",

  // 本地大模型服务所用模型标识
  "codeatlas.selectedModel": "qwen2.5-coder:7b",

  // 是否启用基于内容哈希的增量扫描缓存
  "codeatlas.enableIncrementalCache": true
}
```

---

## AI Agent (MCP) 接入配置

外部 AI Agent 可直接通过 Stdio 调用扩展内置的 `out/mcpEntry.js` 脚本。

### 1. Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "codeatlas": {
      "command": "node",
      "args": ["<插件安装路径>/out/mcpEntry.js", "<项目根目录绝对路径>"]
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
      "args": ["<插件安装路径>/out/mcpEntry.js", "<项目根目录绝对路径>"]
    }
  }
}
```

### 暴露的标准 MCP 工具
* `get_symbol_context`：获取指定符号的签名、调用者列表、被调用列表及接口契约。
* `trace_call_path`：计算两个符号之间的静态调用链最短路径。
* `search_codebase_symbols`：按名称及类型签名过滤检索符号。
* `get_dead_code_report`：扫描项目中未被外部调用的孤立顶层符号列表。
* `call_local_llm` / `batch_local_llm`：通过本地模型辅助推导业务摘要。

---

## 开源协议

本项目采用 [MIT License](https://github.com/voidric/CodeAtlas-Architecture/blob/main/LICENSE) 开源协议。
