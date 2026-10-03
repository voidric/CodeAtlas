import * as assert from 'assert';
import { TsLanguageParser } from '../parser/tsLanguageParser';
import { HierarchyManager } from '../graph/hierarchyManager';
import { MacroClusterEngine } from '../graph/macroCluster';
import { SymbolNode, ClassNode, FunctionNode, RelationEdge } from '../types';

console.log('================================================================');
console.log('🌟 Testing CodeAtlas Architecture New Features: TS Parser, Tree & Macro');
console.log('================================================================');

// 1. 测试 TsLanguageParser
console.log('\n[Test 1] TypeScript AST Parser...');
const tsCode = `
import { BaseService } from './base';
import axios from 'axios';

/**
 * 订单管理服务类
 */
export class OrderService extends BaseService {
  /**
   * 创建订单接口
   * @param userId 用户ID
   * @param amount 金额
   */
  public async createOrder(userId: string, amount: number = 0.0): Promise<boolean> {
    const valid = this.checkUser(userId);
    return valid;
  }

  private checkUser(uid: string): boolean {
    return uid.length > 0;
  }
}

/**
 * 格式化货币
 */
export function formatCurrency(val: number): string {
  return '$' + val.toFixed(2);
}

export const computeDiscount = (total: number, rate: number): number => {
  return total * rate;
};
`;

const tsParser = new TsLanguageParser();
const parseResult = tsParser.parse(tsCode, 'src/services/orderService.ts');

assert.strictEqual(parseResult.symbols.length, 5, 'Should extract 1 class + 2 methods + 1 function + 1 arrow function');

const cls = parseResult.symbols.find(s => s.kind === 'class') as ClassNode;
assert.ok(cls, 'OrderService class should exist');
assert.strictEqual(cls.name, 'OrderService');
assert.deepStrictEqual(cls.bases, ['BaseService']);
assert.strictEqual(cls.docstring?.summary, '订单管理服务类');

const createOrder = parseResult.symbols.find(s => s.name === 'createOrder') as FunctionNode;
assert.ok(createOrder, 'createOrder method should exist');
assert.strictEqual(createOrder.parameters.length, 2);
assert.strictEqual(createOrder.parameters[0].name, 'userId');
assert.strictEqual(createOrder.parameters[0].typeHint, 'string');
assert.strictEqual(createOrder.parameters[1].defaultValue, '0.0');
assert.strictEqual(createOrder.returnType, 'Promise<boolean>');

const formatFn = parseResult.symbols.find(s => s.name === 'formatCurrency') as FunctionNode;
assert.ok(formatFn, 'formatCurrency function should exist');
assert.strictEqual(formatFn.returnType, 'string');

const arrowFn = parseResult.symbols.find(s => s.name === 'computeDiscount') as FunctionNode;
assert.ok(arrowFn, 'computeDiscount arrow function should exist');
assert.strictEqual(arrowFn.parameters.length, 2);

assert.ok(parseResult.imports.length >= 2, 'Should extract import statements');
assert.ok(parseResult.callSites.length >= 1, 'Should extract call expressions');
console.log('  ✓ TsLanguageParser PASSED');

// 2. 测试 HierarchyManager
console.log('\n[Test 2] HierarchyManager Architecture Tree...');
const mockSymbols: SymbolNode[] = [
  cls,
  createOrder,
  formatFn,
  arrowFn,
  {
    id: 'src/api/orderController.ts#getOrder',
    name: 'getOrder',
    kind: 'function',
    filePath: 'src/api/orderController.ts',
    range: { startLine: 1, startColumn: 1, endLine: 5, endColumn: 1 },
    decorators: [],
    isExported: true,
    isDeadCodeCandidate: true,
    parameters: [],
  }
];

const deadSet = new Set<string>(['src/api/orderController.ts#getOrder']);
const tree = HierarchyManager.buildTree(mockSymbols, deadSet);

assert.ok(tree.length > 0, 'Tree root should not be empty');
console.log(`  Tree root nodes: ${tree.map(t => t.name).join(', ')}`);

// 检查是否正确生成了嵌套结构与统计信息
function findInTree(nodes: any[], name: string): any {
  for (const n of nodes) {
    if (n.name === name) return n;
    if (n.children) {
      const found = findInTree(n.children, name);
      if (found) return found;
    }
  }
  return null;
}

const serviceFileNode = findInTree(tree, 'orderService.ts');
assert.ok(serviceFileNode, 'orderService.ts file node should exist');
assert.strictEqual(serviceFileNode.stats.totalClasses, 1);
assert.strictEqual(serviceFileNode.stats.totalFunctions, 3);

const deadNode = findInTree(tree, 'getOrder');
assert.ok(deadNode, 'getOrder dead node should exist');
assert.strictEqual(deadNode.isDeadCodeCandidate, true, 'isDeadCodeCandidate should be true');
console.log('  ✓ HierarchyManager PASSED');

// 3. 测试 MacroClusterEngine
console.log('\n[Test 3] MacroClusterEngine Module Clustering...');
const mockEdges: RelationEdge[] = [
  {
    id: 'edge1',
    source: 'src/api/orderController.ts#getOrder',
    target: createOrder.id,
    kind: 'calls'
  }
];

const macro = MacroClusterEngine.cluster(mockSymbols, mockEdges);
assert.ok(macro.modules.length >= 2, 'Should cluster into at least 2 modules (src/api and src/services)');
const edge = macro.edges.find(e => e.source === 'src/api' && e.target === 'src/services');
assert.ok(edge, 'Should have cross-module directed edge from src/api to src/services');
assert.strictEqual(edge!.callWeight, 1);
console.log(`  Modules: ${macro.modules.map(m => m.name).join(', ')}`);
console.log(`  Cross-module edge: ${edge!.source} --> ${edge!.target} (${edge!.callWeight} calls)`);
console.log('  ✓ MacroClusterEngine PASSED');

console.log('\n================================================================');
console.log('🎉 ALL NEW FEATURE TESTS PASSED (3/3)');
console.log('================================================================\n');
