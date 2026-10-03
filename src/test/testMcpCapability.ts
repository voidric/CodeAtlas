import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import * as assert from 'assert';
import * as readline from 'readline';

interface JsonRpcMessage {
  jsonrpc: string;
  id?: number | string;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

class McpTestClient {
  private proc: ChildProcessWithoutNullStreams;
  private pendingRequests = new Map<number | string, (msg: JsonRpcMessage) => void>();
  private messageQueue: JsonRpcMessage[] = [];
  private nextId = 1;
  public stderrLogs: string[] = [];

  constructor(workspaceDir: string) {
    const entryPath = path.resolve(__dirname, '../../out/mcpEntry.js');
    this.proc = spawn('node', [entryPath, workspaceDir], {
      cwd: workspaceDir,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
    });

    const rl = readline.createInterface({
      input: this.proc.stdout,
      terminal: false
    });

    rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const msg = JSON.parse(trimmed) as JsonRpcMessage;
        if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
          const resolve = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);
          resolve(msg);
        } else {
          this.messageQueue.push(msg);
        }
      } catch (err) {
        console.error('Failed to parse stdout JSON line:', trimmed, err);
      }
    });

    this.proc.stderr.on('data', (chunk: Buffer) => {
      this.stderrLogs.push(chunk.toString('utf-8'));
    });
  }

  public async request(method: string, params?: any): Promise<JsonRpcMessage> {
    const id = this.nextId++;
    const payload: JsonRpcMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise<JsonRpcMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP request timeout (15s): ${method} (id=${id})`));
      }, 15000);

      this.pendingRequests.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });

      this.proc.stdin.write(JSON.stringify(payload) + '\n');
    });
  }

  public async notify(method: string, params?: any): Promise<void> {
    const payload = {
      jsonrpc: '2.0',
      method,
      params
    };
    this.proc.stdin.write(JSON.stringify(payload) + '\n');
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  public sendRaw(rawText: string): void {
    this.proc.stdin.write(rawText + '\n');
  }

  public getUnexpectedMessages(): JsonRpcMessage[] {
    return [...this.messageQueue];
  }

  public close(): void {
    this.proc.kill();
  }
}

async function runMcpCapabilityTests() {
  console.log('================================================================');
  console.log('       CodeAtlas MCP (Model Context Protocol) 综合能力实测');
  console.log('================================================================');

  const workspaceDir = path.resolve(__dirname, '../../');
  const client = new McpTestClient(workspaceDir);

  let passedCount = 0;
  let failedCount = 0;

  async function testCase(name: string, fn: () => Promise<void>) {
    process.stdout.write(`\n[Test] ${name} ... `);
    try {
      await fn();
      console.log('✅ 通过');
      passedCount++;
    } catch (err: any) {
      console.log('❌ 失败');
      console.error('      原因:', err.message || err);
      failedCount++;
    }
  }

  try {
    // -------------------------------------------------------------
    // 一、协议生命周期与握手规范测试
    // -------------------------------------------------------------
    await testCase('1.1 协议握手 (initialize)', async () => {
      const res = await client.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'AntigravityAgent', version: '2.0.0' }
      });
      assert.strictEqual(res.jsonrpc, '2.0');
      assert.ok(res.result, '需返回 result 对象');
      assert.strictEqual(res.result.protocolVersion, '2024-11-05');
      assert.ok(res.result.capabilities?.tools, '需包含 tools capability');
      assert.strictEqual(res.result.serverInfo?.name, 'codeatlas');
      assert.strictEqual(res.result.serverInfo?.version, '0.1.0');
    });

    await testCase('1.2 初始化通知静默机制 (notifications/initialized)', async () => {
      const beforeQueueLength = client.getUnexpectedMessages().length;
      await client.notify('notifications/initialized');
      const afterQueueLength = client.getUnexpectedMessages().length;
      assert.strictEqual(beforeQueueLength, afterQueueLength, 'Notification 严禁触发任何 stdout 响应报文');
    });

    await testCase('1.3 心跳存活探测 (ping)', async () => {
      const res = await client.request('ping');
      assert.strictEqual(res.jsonrpc, '2.0');
      assert.deepStrictEqual(res.result, {});
    });

    await testCase('1.4 工具列表发现 (tools/list)', async () => {
      const res = await client.request('tools/list');
      assert.ok(Array.isArray(res.result?.tools), 'tools 必须为数组');
      const tools = res.result.tools;
      assert.strictEqual(tools.length, 6, '必须暴露 6 个标准 MCP 工具');

      const expectedNames = [
        'get_symbol_context',
        'trace_call_path',
        'search_codebase_symbols',
        'get_dead_code_report',
        'call_local_llm',
        'batch_local_llm'
      ];
      for (const name of expectedNames) {
        const found = tools.find((t: any) => t.name === name);
        assert.ok(found, `工具 ${name} 必须存在`);
        assert.ok(found.description, `工具 ${name} 必须包含 description`);
        assert.strictEqual(found.inputSchema?.type, 'object', `工具 ${name} inputSchema 必须为 object`);
      }
    });

    // -------------------------------------------------------------
    // 二、MCP 业务工具执行能力测试
    // -------------------------------------------------------------
    await testCase('2.1 代码库符号检索 (search_codebase_symbols)', async () => {
      // 关键字搜索
      const res = await client.request('tools/call', {
        name: 'search_codebase_symbols',
        arguments: { query: 'checkout', limit: 5 }
      });
      assert.ok(res.result?.content?.[0]?.text);
      const data = JSON.parse(res.result.content[0].text);
      assert.strictEqual(data.query, 'checkout');
      assert.ok(data.totalMatches >= 1);
      assert.ok(data.matches.some((m: any) => m.name === 'checkout_order'));

      // 语法特征检索
      const syntaxRes = await client.request('tools/call', {
        name: 'search_codebase_symbols',
        arguments: { query: 'in:float out:dict', limit: 5 }
      });
      const syntaxData = JSON.parse(syntaxRes.result.content[0].text);
      assert.ok(syntaxData.matches.some((m: any) => m.name === 'checkout_order'));
    });

    await testCase('2.2 实体拓扑与上下文切片 (get_symbol_context)', async () => {
      const res = await client.request('tools/call', {
        name: 'get_symbol_context',
        arguments: { symbolId: 'sample_project/services/order_service.py#checkout_order' }
      });
      assert.ok(res.result?.content?.[0]?.text);
      const data = JSON.parse(res.result.content[0].text);
      assert.strictEqual(data.symbol.name, 'checkout_order');
      assert.strictEqual(data.symbol.kind, 'function');
      assert.ok(Array.isArray(data.callers) && data.callers.length >= 1, '需识别入度调用者');
      assert.ok(Array.isArray(data.callees) && data.callees.length >= 5, '需识别出度依赖项');
      assert.ok(typeof data.markdownContext === 'string' && data.markdownContext.includes('### Symbol: checkout_order'));
    });

    await testCase('2.3 跨实体调用链寻路 (trace_call_path)', async () => {
      const res = await client.request('tools/call', {
        name: 'trace_call_path',
        arguments: {
          fromSymbol: 'sample_project/main.py#start_application',
          toSymbol: 'sample_project/utils/calculator.py#calculate_tax'
        }
      });
      assert.ok(res.result?.content?.[0]?.text);
      const data = JSON.parse(res.result.content[0].text);
      assert.strictEqual(data.found, true);
      assert.ok(data.totalHops >= 2);
      assert.ok(data.callChain.includes('start_application') && data.callChain.includes('calculate_tax'));
      assert.ok(Array.isArray(data.steps) && data.steps.length === data.totalHops + 1);
    });

    await testCase('2.4 死代码雷达扫描 (get_dead_code_report)', async () => {
      const res = await client.request('tools/call', {
        name: 'get_dead_code_report',
        arguments: { limit: 10 }
      });
      assert.ok(res.result?.content?.[0]?.text);
      const data = JSON.parse(res.result.content[0].text);
      assert.ok(data.totalCandidates >= 1);
      assert.ok(Array.isArray(data.candidates));
      const hasAbandoned = data.candidates.some((c: any) => c.name === 'abandoned_backup_cron');
      assert.ok(hasAbandoned, '应准确检测出 abandoned_backup_cron 死代码候选');
    });

    await testCase('2.5 本地轻量级模型调用 (call_local_llm)', async () => {
      const res = await client.request('tools/call', {
        name: 'call_local_llm',
        arguments: {
          prompt: '请只回复一个单词: PONG'
        }
      });
      assert.ok(res.result?.content?.[0]?.text);
      const data = JSON.parse(res.result.content[0].text);
      if (data.error) {
        console.log(`\n      (提示: 本地模型服务状态: ${data.error})`);
      } else {
        assert.ok(typeof data.content === 'string' && data.content.length > 0);
      }
    });

    await testCase('2.6 批量本地模型调用 (batch_local_llm)', async () => {
      const res = await client.request('tools/call', {
        name: 'batch_local_llm',
        arguments: {
          prompts: ['ping 1', 'ping 2']
        }
      });
      assert.ok(res.result?.content?.[0]?.text);
      const data = JSON.parse(res.result.content[0].text);
      assert.strictEqual(data.total, 2);
      assert.ok(Array.isArray(data.results) && data.results.length === 2);
    });

    // -------------------------------------------------------------
    // 三、容错与边界异常测试
    // -------------------------------------------------------------
    await testCase('3.1 未知工具分发容错', async () => {
      const res = await client.request('tools/call', {
        name: 'unknown_tool_xyz',
        arguments: {}
      });
      const data = JSON.parse(res.result.content[0].text);
      assert.ok(data.error && data.error.includes('未知 MCP 工具'));
    });

    await testCase('3.2 未知 JSON-RPC 方法错误代码规范 (-32601)', async () => {
      const res = await client.request('unknown/method');
      assert.strictEqual(res.error?.code, -32601);
      assert.strictEqual(res.error?.message, 'Method not found');
    });

    await testCase('3.3 不存在的符号上下文容错', async () => {
      const res = await client.request('tools/call', {
        name: 'get_symbol_context',
        arguments: { symbolId: 'invalid/file.py#unknown_fn' }
      });
      const data = JSON.parse(res.result.content[0].text);
      assert.ok(data.error && data.error.includes('未在代码库拓扑中找到实体'));
    });

    await testCase('3.4 不通链路寻路容错', async () => {
      const res = await client.request('tools/call', {
        name: 'trace_call_path',
        arguments: {
          fromSymbol: 'sample_project/main.py#abandoned_backup_cron',
          toSymbol: 'sample_project/utils/calculator.py#calculate_tax'
        }
      });
      const data = JSON.parse(res.result.content[0].text);
      assert.strictEqual(data.found, false);
      assert.ok(data.message && data.message.includes('未找到'));
    });

    // -------------------------------------------------------------
    // 四、Stdio 流纯净度验证
    // -------------------------------------------------------------
    await testCase('4.1 Stdio 数据流隔离审计', async () => {
      const unexpected = client.getUnexpectedMessages();
      assert.strictEqual(unexpected.length, 0, 'stdout 不得产生任何未关联协议的脏数据');
      assert.ok(client.stderrLogs.length > 0, '服务端运维/启动日志必须全部归流至 stderr');
      assert.ok(client.stderrLogs.some(log => log.includes('[CodeAtlas MCP] 已就绪')));
    });

  } finally {
    client.close();
  }

  console.log('\n================================================================');
  console.log(`实测总结: 共计 ${passedCount + failedCount} 项测试, ✅ 通过: ${passedCount}, ❌ 失败: ${failedCount}`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runMcpCapabilityTests().catch(err => {
  console.error('MCP Capability Test Runner 致命异常:', err);
  process.exit(1);
});
