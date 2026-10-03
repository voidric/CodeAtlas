/**
 * FunctionGraph 第一版 MVP 端到端自动化集成验证脚本
 */
import * as fs from 'fs';
import * as path from 'path';
import { parsePythonFile } from '../parser/pythonParser';
import { resolveImportsAndRelations } from '../parser/importResolver';
import { GraphManager } from '../graph/graphManager';
import { PathFinder } from '../graph/pathFinder';
import { DeadCodeDetector } from '../graph/deadCodeDetector';
import { FileParseResult, SymbolNode } from '../types';

async function runMvpVerification() {
  console.log('================================================================');
  console.log('🚀 FunctionGraph v0.1.0 MVP 端到端综合业务链路验证');
  console.log('================================================================\n');

  const rootDir = path.resolve(__dirname, '../../sample_project');
  console.log(`📁 正在扫描测试工程目录: ${rootDir}`);

  const workspaceRoot = path.resolve(rootDir, '..');
  function getAllPyFiles(dir: string): { abs: string; rel: string }[] {
    let results: { abs: string; rel: string }[] = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        results = results.concat(getAllPyFiles(fullPath));
      } else if (file.endsWith('.py')) {
        const rel = path.relative(workspaceRoot, fullPath).replace(/\\/g, '/');
        results.push({ abs: fullPath, rel });
      }
    }
    return results;
  }

  const pyFiles = getAllPyFiles(rootDir);
  console.log(`✓ 扫描到 ${pyFiles.length} 个 Python 源文件:`);
  pyFiles.forEach(f => console.log(`   - ${f.rel}`));

  // 2. 语法解析
  console.log('\n[Step 1] 执行 Python AST 语法实体提取与签名分析...');
  const parseResults = new Map<string, FileParseResult>();
  for (const f of pyFiles) {
    const code = fs.readFileSync(f.abs, 'utf-8');
    const parsed = parsePythonFile(code, f.rel);
    parseResults.set(f.rel, parsed);
    console.log(`   * ${f.rel}: 提取 ${parsed.symbols.length} 个符号, ${parsed.imports.length} 个导入, ${parsed.callSites.length} 个调用点`);
  }

  // 3. 跨文件符号消歧与关系图谱构建
  console.log('\n[Step 2] 执行跨文件 Import 消歧与图拓扑构建...');
  const edges = resolveImportsAndRelations(parseResults);
  const symbols: SymbolNode[] = [];
  for (const fileResult of parseResults.values()) {
    symbols.push(...fileResult.symbols);
  }

  const graphManager = new GraphManager();
  graphManager.loadWorkspace(symbols, edges);

  const stats = graphManager.getStats();
  console.log(`✓ 拓扑图装载成功!`);
  console.log(`   总实体数: ${stats.totalNodes} (函数: ${stats.functionCount}, 类: ${stats.classCount})`);
  console.log(`   总依赖边: ${stats.totalEdges}`);

  // 4. 验证 Ego Graph (局部聚焦图)
  console.log('\n[Step 3] 验证 FR-05 / FR-06 Ego Graph (局部聚焦图算法)...');
  const targetFuncId = 'sample_project/services/order_service.py#checkout_order';
  const ego = graphManager.getEgoGraph(targetFuncId);

  if (!ego) {
    throw new Error(`无法获取 ${targetFuncId} 的 Ego Graph!`);
  }

  console.log(`✓ 中心实体: ${ego.center.name} (${ego.center.kind})`);
  console.log(`   位置: ${ego.center.filePath}:L${ego.center.range.startLine}`);
  console.log(`   入度前驱 (调用者): ${ego.predecessors.length} 个`);
  ego.predecessors.forEach(p => console.log(`     <- [${p.edge.kind}] ${p.node.name} (${p.node.filePath})`));
  console.log(`   出度后继 (依赖项): ${ego.successors.length} 个`);
  ego.successors.forEach(s => console.log(`     -> [${s.edge.kind}] ${s.node.name} (${s.node.filePath})`));

  if (ego.predecessors.length === 0 || ego.successors.length === 0) {
    throw new Error('Ego Graph 入度或出度为空，关联未能成功构建！');
  }

  // 5. 验证端到端调用链寻路 (Pathfinding)
  console.log('\n[Step 4] 验证 FR-07 端到端调用链追踪 (Shortest Path)...');
  const startId = 'sample_project/main.py#start_application';
  const endId = 'sample_project/utils/calculator.py#calculate_tax';
  console.log(`   寻找从 [${startId}] 到 [${endId}] 的业务调用链路...`);

  const pathResult = PathFinder.findPath(graphManager, startId, endId);
  if (!pathResult) {
    throw new Error(`寻路失败：未找到从 ${startId} 到 ${endId} 的链路`);
  }

  console.log(`✓ 成功定位到完整链路 (跳数: ${pathResult.totalHops}):`);
  pathResult.nodes.forEach((n, idx) => {
    if (idx < pathResult.nodes.length - 1) {
      const edge = pathResult.edges[idx];
      console.log(`     (${idx + 1}) [${n.kind}] ${n.name} --[${edge.kind}]-->`);
    } else {
      console.log(`     (${idx + 1}) [${n.kind}] ${n.name} (目标到达!)`);
    }
  });

  // 6. 验证孤立死代码检测 (Dead Code Radar)
  console.log('\n[Step 5] 验证 FR-08 孤立死代码雷达检测...');
  const deadCandidates = DeadCodeDetector.detect(graphManager, { updateNodeFlag: true });
  console.log(`✓ 检测到 ${deadCandidates.length} 个孤立死代码候选:`);
  deadCandidates.forEach(d => console.log(`   ⚠️ [${d.kind}] ${d.name} (${d.filePath}:L${d.range.startLine})`));

  const deadNames = deadCandidates.map(d => d.name);
  if (!deadNames.includes('unused_legacy_formula')) {
    throw new Error('Dead Code Radar 未能识别 unused_legacy_formula！');
  }
  if (!deadNames.includes('abandoned_backup_cron')) {
    throw new Error('Dead Code Radar 未能识别 abandoned_backup_cron！');
  }
  if (deadNames.includes('checkout_order') || deadNames.includes('calculate_tax')) {
    throw new Error('Dead Code Radar 发生误报：正常业务链函数被错误标记！');
  }

  console.log('\n================================================================');
  console.log('🎉 FunctionGraph v0.1.0 MVP 端到端全部核心链路验证 100% 通过！');
  console.log('================================================================\n');
}

runMvpVerification().catch(err => {
  console.error('\n❌ 验证失败:', err);
  process.exit(1);
});
