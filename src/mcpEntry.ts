/**
 * CodeAtlas Architecture 标准 MCP (Model Context Protocol) Stdio 独立运行入口
 * 供 Antigravity / Codex / Cursor 作为本地 MCP 工具服务直接配置运行：
 *   node out/mcpEntry.js
 */

import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs';
import { ParserRegistry } from './parser/parserRegistry';
import { resolveImportsAndRelations } from './parser/importResolver';
import { GraphManager } from './graph/graphManager';
import { CacheManager } from './graph/cacheManager';
import { SearchEngine } from './search/searchEngine';
import { CodeAtlasMcpServer } from './ai/mcpServer';
import { FileParseResult, SymbolNode } from './types';

async function main() {
  const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const workspaceRoot = fs.existsSync(targetDir) ? targetDir : path.resolve(__dirname, '..');
  const graphManager = new GraphManager();
  const searchEngine = new SearchEngine();
  const cacheManager = new CacheManager(workspaceRoot);

  // 1. 初始化并快速载入工作区符号 (支持 Python / TypeScript / JavaScript)
  const supportedExts = new Set(ParserRegistry.getSupportedExtensions());

  function scanCodeFiles(dir: string): { relPath: string; absPath: string }[] {
    let list: { relPath: string; absPath: string }[] = [];
    if (!fs.existsSync(dir)) return list;
    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (item === '.git' || item === '__pycache__' || item === '.venv' || item === 'node_modules' || item === 'out' || item === 'dist') continue;
      const full = path.join(dir, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        list = list.concat(scanCodeFiles(full));
      } else {
        const extMatch = item.match(/\.[^.]+$/);
        if (extMatch && supportedExts.has(extMatch[0].toLowerCase())) {
          list.push({
            relPath: path.relative(workspaceRoot, full).replace(/\\/g, '/'),
            absPath: full
          });
        }
      }
    }
    return list;
  }

  const codeFiles = scanCodeFiles(workspaceRoot);
  const parseResults = new Map<string, FileParseResult>();
  for (const f of codeFiles) {
    try {
      const code = fs.readFileSync(f.absPath, 'utf-8');
      const parser = ParserRegistry.getParserForFile(f.absPath);
      if (parser) {
        parseResults.set(f.relPath, parser.parse(code, f.relPath));
      }
    } catch (err) {
      console.warn(`Failed to parse file: ${f.absPath}`, err);
    }
  }
  const edges = resolveImportsAndRelations(parseResults);
  const symbols: SymbolNode[] = [];
  for (const r of parseResults.values()) {
    symbols.push(...r.symbols);
  }
  graphManager.loadWorkspace(symbols, edges);

  const mcpServer = new CodeAtlasMcpServer(graphManager, searchEngine);

  // 2. 监听来自 Antigravity / Codex 的 Stdio JSON-RPC 通信
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const request = JSON.parse(trimmed);
      const response = await mcpServer.handleJsonRpc(request);
      if (response !== null && response !== undefined) {
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch (err: any) {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error', data: err?.message }
        }) + '\n'
      );
    }
  });

  // 日志输出至 stderr，避免污染 stdout 的 JSON-RPC 数据流
  process.stderr.write(`[CodeAtlas MCP] 已就绪 (工作区: ${workspaceRoot}, 实体: ${symbols.length}, 边: ${edges.length})\n`);
}

main().catch(err => {
  process.stderr.write(`[CodeAtlas MCP 启动失败]: ${err}\n`);
  process.exit(1);
});
