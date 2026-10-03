/**
 * FunctionGraph Phase 2 综合集成测试 (Ollama + Cache + Search + MCP)
 */

import * as fs from 'fs';
import * as path from 'path';
import { parsePythonFile } from '../parser/pythonParser';
import { resolveImportsAndRelations } from '../parser/importResolver';
import { GraphManager } from '../graph/graphManager';
import { CacheManager } from '../graph/cacheManager';
import { OllamaClient } from '../ai/ollamaClient';
import { SearchEngine } from '../search/searchEngine';
import { CodeAtlasMcpServer } from '../ai/mcpServer';
import { FileParseResult, SymbolNode } from '../types';

async function runPhase2Tests() {
  console.log('================================================================');
  console.log('🌟 FunctionGraph Phase 2 (Ollama + Cache + Search + MCP) 集成测试');
  console.log('================================================================\n');

  const workspaceRoot = path.resolve(__dirname, '../../');
  const sampleDir = path.resolve(workspaceRoot, 'sample_project');

  // 1. 初始化 Ollama 客户端
  console.log('[Step 1] 初始化本地 Ollama 客户端...');
  const ollama = new OllamaClient();
  const initRes = await ollama.init();
  console.log(`   Ollama 状态: ${initRes.success ? '在线' : '离线'}, 选定模型: ${initRes.activeModel || '无'}`);

  // 2. 测试 CacheManager 快照与冷启动加速
  console.log('\n[Step 2] 验证 CacheManager 增量快照与冷启动秒级恢复...');
  const cacheManager = new CacheManager(workspaceRoot);

  function getPyFiles(dir: string): { relPath: string; absPath: string }[] {
    let res: { relPath: string; absPath: string }[] = [];
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) {
        res = res.concat(getPyFiles(p));
      } else if (f.endsWith('.py')) {
        res.push({
          relPath: path.relative(workspaceRoot, p).replace(/\\/g, '/'),
          absPath: p
        });
      }
    }
    return res;
  }

  const currentFiles = getPyFiles(sampleDir);

  // 解析并生成快照
  const parseResults = new Map<string, FileParseResult>();
  for (const f of currentFiles) {
    const code = fs.readFileSync(f.absPath, 'utf-8');
    parseResults.set(f.relPath, parsePythonFile(code, f.relPath));
  }
  const edges = resolveImportsAndRelations(parseResults);
  cacheManager.saveSnapshot(parseResults, workspaceRoot, edges);
  console.log(`   ✓ 已保存快照到 .vscode/.functiongraph_cache.json`);

  // 模拟二次冷启动读取
  const snapshot = cacheManager.loadSnapshot();
  if (!snapshot) throw new Error('读取缓存快照失败！');
  const diff = cacheManager.diffFiles(currentFiles, snapshot);
  console.log(`   ✓ 冷启动快照对比: needsParsing = ${diff.needsParsing.length}, reusable = ${diff.reusableParseResults.size}`);
  if (!diff.isFullyValid) throw new Error('冷启动快照校验失败！');

  // 构建图谱
  const graphManager = new GraphManager();
  const allSymbols: SymbolNode[] = [];
  for (const r of parseResults.values()) {
    allSymbols.push(...r.symbols);
  }
  graphManager.loadWorkspace(allSymbols, edges);

  // 3. 测试 SearchEngine 复合语法与自然语言检索
  console.log('\n[Step 3] 验证 SearchEngine 复合特征过滤与本地大模型语义检索...');
  const searchEngine = new SearchEngine(ollama);

  // 测试 3.1: 语法过滤 in:float out:dict
  console.log('   * 检索表达式: "in:float out:dict"');
  const filterResults = await searchEngine.search(allSymbols, 'in:float out:dict');
  console.log(`     命中 ${filterResults.length} 条记录:`);
  filterResults.forEach(r => console.log(`       - [${r.node.kind}] ${r.node.name} (${r.matchedReason})`));
  if (!filterResults.some(r => r.node.name === 'checkout_order')) {
    throw new Error('过滤检索未能匹配 checkout_order！');
  }

  // 测试 3.2: 口语化自然语言检索 (通过 Ollama 意图改写)
  console.log('\n   * 口语化自然语言检索: "怎样给订单打折"');
  const nlResults = await searchEngine.search(allSymbols, '怎样给订单打折');
  console.log(`     语义命中 ${nlResults.length} 条记录:`);
  nlResults.slice(0, 3).forEach(r => console.log(`       - [${r.node.kind}] ${r.node.name} (得分: ${r.score}, ${r.matchedReason})`));
  if (!nlResults.some(r => r.node.name === 'calculate_discount')) {
    throw new Error('自然语言检索未能召回 calculate_discount！');
  }

  // 4. 测试 MCP 原生服务协议
  console.log('\n[Step 4] 验证 FunctionGraph MCP Server 协议调用 (Antigravity/Codex 对接)...');
  const mcpServer = new CodeAtlasMcpServer(graphManager, searchEngine);

  // 4.0 测试 MCP 握手协议 (initialize, notification, ping)
  const initResp = await mcpServer.handleJsonRpc({
    method: 'initialize',
    id: 1,
    params: { protocolVersion: '2024-11-05', clientInfo: { name: 'testClient', version: '1.0' } }
  });
  if (!initResp.result?.capabilities?.tools || initResp.result?.serverInfo?.name !== 'codeatlas') {
    throw new Error('MCP initialize 响应不符合规范！');
  }
  console.log(`   ✓ MCP initialize 握手成功: protocolVersion=${initResp.result.protocolVersion}, server=${initResp.result.serverInfo.name}`);

  const notifResp = await mcpServer.handleJsonRpc({ method: 'notifications/initialized' });
  if (notifResp !== null) {
    throw new Error('MCP Notification 严禁返回任何非 null 响应！');
  }
  console.log('   ✓ MCP notifications/initialized 静默处理成功');

  const pingResp = await mcpServer.handleJsonRpc({ method: 'ping', id: 2 });
  if (pingResp.id !== 2 || pingResp.error) {
    throw new Error('MCP ping 心跳失败！');
  }
  console.log('   ✓ MCP ping 心跳测试通过');

  // 4.1 测试 tools/list
  const toolsListResp = await mcpServer.handleJsonRpc({ method: 'tools/list', id: 3 });
  const toolNames = toolsListResp.result.tools.map((t: any) => t.name);
  console.log(`   ✓ MCP 工具列表加载成功 (${toolNames.length} 个): ${toolNames.join(', ')}`);

  // 4.2 测试 get_symbol_context
  const toolContextResp = await mcpServer.handleJsonRpc({
    method: 'tools/call',
    id: 2,
    params: {
      name: 'get_symbol_context',
      arguments: { symbolId: 'sample_project/services/order_service.py#checkout_order' }
    }
  });
  const contextData = JSON.parse(toolContextResp.result.content[0].text);
  console.log(`   ✓ MCP get_symbol_context 返回结果:`);
  console.log(`     - 实体名称: ${contextData.symbol.name}`);
  console.log(`     - 调用者数: ${contextData.callers.length}`);
  console.log(`     - 依赖项数: ${contextData.callees.length}`);

  // 4.3 测试 trace_call_path
  const traceResp = await mcpServer.handleJsonRpc({
    method: 'tools/call',
    id: 3,
    params: {
      name: 'trace_call_path',
      arguments: {
        fromSymbol: 'sample_project/main.py#start_application',
        toSymbol: 'sample_project/utils/calculator.py#calculate_tax'
      }
    }
  });
  const traceData = JSON.parse(traceResp.result.content[0].text);
  console.log(`   ✓ MCP trace_call_path 寻路结果: ${traceData.callChain} (共 ${traceData.totalHops} 跳)`);

  // 4.4 测试 get_dead_code_report
  const deadResp = await mcpServer.handleJsonRpc({
    method: 'tools/call',
    id: 4,
    params: { name: 'get_dead_code_report' }
  });
  const deadData = JSON.parse(deadResp.result.content[0].text);
  console.log(`   ✓ MCP get_dead_code_report 检测到死代码候选: ${deadData.totalCandidates} 个`);

  console.log('\n================================================================');
  console.log('🎉 FunctionGraph Phase 2 全部功能与集成测试 100% 通过！');
  console.log('================================================================\n');
}

runPhase2Tests().catch(err => {
  console.error('\n❌ Phase 2 测试失败:', err);
  process.exit(1);
});
