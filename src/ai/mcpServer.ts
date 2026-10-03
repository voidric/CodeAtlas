/**
 * CodeAtlas Architecture MCP (Model Context Protocol) 原生服务引擎 (FR-18)
 * 向 Antigravity / Codex / Cursor 等 AI Agent 暴露标准工具，精准提供代码拓扑切片与上下文
 */

import { GraphManager } from '../graph/graphManager';
import { PathFinder } from '../graph/pathFinder';
import { DeadCodeDetector } from '../graph/deadCodeDetector';
import { SearchEngine } from '../search/searchEngine';
import { SymbolNode, FunctionNode } from '../types';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export class CodeAtlasMcpServer {
  private searchEngine: SearchEngine;

  constructor(
    private graphManager: GraphManager,
    searchEngine?: SearchEngine
  ) {
    this.searchEngine = searchEngine || new SearchEngine();
  }

  /**
   * 获取所有暴露给 AI Agent 的工具元数据
   */
  public getToolDefinitions(): McpToolDefinition[] {
    return [
      {
        name: 'get_symbol_context',
        description: '获取指定 Python 函数或类的完整契约、调用者(Callers)、依赖项(Callees)及所属类拓扑',
        inputSchema: {
          type: 'object',
          properties: {
            symbolId: {
              type: 'string',
              description: '实体的全局唯一标识符，格式为 "相对文件路径#符号名" (例如: "sample_project/services/order_service.py#checkout_order")'
            }
          },
          required: ['symbolId']
        }
      },
      {
        name: 'trace_call_path',
        description: '查找两个 Python 函数/类之间的静态调用与依赖链路 (最短链路路径)',
        inputSchema: {
          type: 'object',
          properties: {
            fromSymbol: {
              type: 'string',
              description: '链路起点函数/类 ID'
            },
            toSymbol: {
              type: 'string',
              description: '链路终点函数/类 ID'
            }
          },
          required: ['fromSymbol', 'toSymbol']
        }
      },
      {
        name: 'search_codebase_symbols',
        description: '在工作区 Python 代码库中检索函数与类，支持自然语言意图搜索与语法过滤 (如 in:Type, out:Type)',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索词，例如 "创建订单结算", "计算税率", "in:User out:dict"'
            },
            limit: {
              type: 'number',
              description: '最大返回结果数量，默认 10'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'get_dead_code_report',
        description: '扫描全项目无任何外部引用的孤立死函数与孤立废弃类候选列表 (Dead Code Radar)',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: '返回数量上限，默认 20'
            }
          }
        }
      },
      {
        name: 'call_local_llm',
        description: '调用本地 Ollama 或兼容 OpenAI 格式的大模型执行轻量级推导或任务处理 (0 Token 消耗，适合生成摘要、注释、格式转换)',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: '需要本地模型处理的提示词或指令'
            },
            model: {
              type: 'string',
              description: '模型名称，默认 qwen2.5-coder:7b'
            },
            endpoint: {
              type: 'string',
              description: 'API 端点地址，默认 http://127.0.0.1:11434/v1'
            }
          },
          required: ['prompt']
        }
      },
      {
        name: 'batch_local_llm',
        description: '批量并发调用本地大模型处理多个文本/代码片段，极大节省云端 Agent 的 Token 消耗',
        inputSchema: {
          type: 'object',
          properties: {
            prompts: {
              type: 'array',
              items: { type: 'string' },
              description: '需要批量处理的提示词列表'
            },
            model: {
              type: 'string',
              description: '模型名称，默认 qwen2.5-coder:7b'
            },
            endpoint: {
              type: 'string',
              description: 'API 端点地址，默认 http://127.0.0.1:11434/v1'
            }
          },
          required: ['prompts']
        }
      }
    ];
  }

  /**
   * 执行指定 MCP 工具调用并返回结构化上下文文本
   */
  public async executeTool(toolName: string, args: Record<string, any>): Promise<any> {
    switch (toolName) {
      case 'get_symbol_context': {
        const symbolId = String(args.symbolId || '');
        const ego = this.graphManager.getEgoGraph(symbolId);
        if (!ego) {
          return { error: `未在代码库拓扑中找到实体: ${symbolId}` };
        }

        const center = ego.center;
        const callers = ego.predecessors.map(p => ({
          id: p.node.id,
          name: p.node.name,
          kind: p.node.kind,
          relation: p.edge.kind,
          file: p.node.filePath
        }));
        const callees = ego.successors.map(s => ({
          id: s.node.id,
          name: s.node.name,
          kind: s.node.kind,
          relation: s.edge.kind,
          file: s.node.filePath
        }));

        let markdownContext = `### Symbol: ${center.name} (${center.kind})\n`;
        markdownContext += `- **File**: \`${center.filePath}:L${center.range.startLine}\`\n`;
        if (center.docstring?.summary) {
          markdownContext += `- **Summary**: ${center.docstring.summary}\n`;
        }
        if (center.kind !== 'class') {
          const fn = center as FunctionNode;
          if (fn.parameters.length) {
            markdownContext += `- **Parameters**: ${fn.parameters.map(p => `${p.name}: ${p.typeHint || 'Any'}`).join(', ')}\n`;
          }
          if (fn.returnType) {
            markdownContext += `- **Returns**: \`${fn.returnType}\`\n`;
          }
        }
        markdownContext += `\n**Incoming Callers / References (${callers.length})**:\n`;
        callers.forEach(c => {
          markdownContext += `- [${c.relation}] \`${c.name}\` (${c.file})\n`;
        });
        markdownContext += `\n**Outgoing Dependencies / Callees (${callees.length})**:\n`;
        callees.forEach(c => {
          markdownContext += `- [${c.relation}] \`${c.name}\` (${c.file})\n`;
        });

        return {
          symbol: center,
          callers,
          callees,
          markdownContext
        };
      }

      case 'trace_call_path': {
        const fromSymbol = String(args.fromSymbol || '');
        const toSymbol = String(args.toSymbol || '');
        const pathResult = PathFinder.findPath(this.graphManager, fromSymbol, toSymbol);

        if (!pathResult || !pathResult.found) {
          return {
            found: false,
            message: pathResult?.message || `未找到从 [${fromSymbol}] 到 [${toSymbol}] 的静态调用链路`
          };
        }

        const steps = pathResult.nodes.map((n, i) => {
          const edgeKind = i < pathResult.edges.length ? pathResult.edges[i].kind : null;
          return {
            step: i + 1,
            name: n.name,
            kind: n.kind,
            filePath: n.filePath,
            nextEdge: edgeKind
          };
        });

        const chainText = pathResult.nodes.map(n => n.name).join(' -> ');

        return {
          found: true,
          totalHops: pathResult.totalHops,
          callChain: chainText,
          steps
        };
      }

      case 'search_codebase_symbols': {
        const query = String(args.query || '');
        const limit = Number(args.limit || 10);
        const results = await this.searchEngine.search(this.graphManager.getAllNodes(), query, limit);

        return {
          query,
          totalMatches: results.length,
          matches: results.map(r => ({
            id: r.node.id,
            name: r.node.name,
            kind: r.node.kind,
            filePath: r.node.filePath,
            summary: r.node.docstring?.summary || '',
            matchedReason: r.matchedReason,
            score: r.score
          }))
        };
      }

      case 'get_dead_code_report': {
        const limit = Number(args.limit || 20);
        const candidates = DeadCodeDetector.detect(this.graphManager, { updateNodeFlag: true });

        return {
          totalCandidates: candidates.length,
          candidates: candidates.slice(0, limit).map(c => ({
            id: c.id,
            name: c.name,
            kind: c.kind,
            filePath: c.filePath,
            startLine: c.range.startLine,
            docstring: c.docstring?.summary || ''
          }))
        };
      }

      case 'call_local_llm': {
        const prompt = String(args.prompt || '');
        const model = String(args.model || 'qwen2.5-coder:7b');
        const endpoint = String(args.endpoint || 'http://127.0.0.1:11434/v1').replace(/\/+$/, '');
        const targetUrl = endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint}/chat/completions`;

        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 60000);
          const resp = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.2
            }),
            signal: controller.signal
          });
          clearTimeout(timer);

          if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            return { error: `本地模型接口返回异常 (${resp.status}): ${errText}` };
          }
          const data = (await resp.json()) as any;
          const content = data?.choices?.[0]?.message?.content || '';
          return {
            model,
            content,
            finish_reason: data?.choices?.[0]?.finish_reason || 'stop'
          };
        } catch (err: any) {
          return { error: `无法连接到本地大模型 (${endpoint}): ${err?.message || err}. 请确保 Ollama 或兼容服务正在运行。` };
        }
      }

      case 'batch_local_llm': {
        const prompts = Array.isArray(args.prompts) ? args.prompts : [];
        const model = String(args.model || 'qwen2.5-coder:7b');
        const endpoint = String(args.endpoint || 'http://127.0.0.1:11434/v1').replace(/\/+$/, '');
        const targetUrl = endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint}/chat/completions`;

        const results: { index: number; prompt: string; content?: string; error?: string }[] = [];
        const concurrency = 3;
        for (let i = 0; i < prompts.length; i += concurrency) {
          const chunk = prompts.slice(i, i + concurrency);
          const chunkPromises = chunk.map(async (p, idx) => {
            const curIndex = i + idx;
            try {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 60000);
              const resp = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model,
                  messages: [{ role: 'user', content: p }],
                  temperature: 0.2
                }),
                signal: controller.signal
              });
              clearTimeout(timer);
              if (!resp.ok) {
                const errText = await resp.text().catch(() => '');
                return { index: curIndex, prompt: p, error: `HTTP ${resp.status}: ${errText}` };
              }
              const data = (await resp.json()) as any;
              return { index: curIndex, prompt: p, content: data?.choices?.[0]?.message?.content || '' };
            } catch (err: any) {
              return { index: curIndex, prompt: p, error: err?.message || String(err) };
            }
          });
          const chunkResults = await Promise.all(chunkPromises);
          results.push(...chunkResults);
        }

        return {
          total: prompts.length,
          model,
          results
        };
      }

      default:
        return { error: `未知 MCP 工具: ${toolName}` };
    }
  }

  /**
   * 处理标准 JSON-RPC MCP 请求格式
   */
  public async handleJsonRpc(request: { method: string; params?: any; id?: any }): Promise<any> {
    if (request.id === undefined || request.method?.startsWith('notifications/')) {
      return null;
    }

    if (request.method === 'initialize') {
      return {
        id: request.id,
        jsonrpc: '2.0',
        result: {
          protocolVersion: request.params?.protocolVersion || '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'codeatlas',
            version: '0.1.0'
          }
        }
      };
    }

    if (request.method === 'ping') {
      return {
        id: request.id,
        jsonrpc: '2.0',
        result: {}
      };
    }

    if (request.method === 'tools/list') {
      return {
        id: request.id,
        jsonrpc: '2.0',
        result: {
          tools: this.getToolDefinitions()
        }
      };
    }

    if (request.method === 'tools/call') {
      const toolName = request.params?.name;
      const toolArgs = request.params?.arguments || {};
      const result = await this.executeTool(toolName, toolArgs);
      return {
        id: request.id,
        jsonrpc: '2.0',
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      };
    }

    return {
      id: request.id,
      jsonrpc: '2.0',
      error: { code: -32601, message: 'Method not found' }
    };
  }
}
