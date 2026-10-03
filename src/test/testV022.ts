import * as assert from 'assert';
import { parsePythonFile } from '../parser/pythonParser';
import { resolveImportsAndRelations } from '../parser/importResolver';
import { GraphManager } from '../graph/graphManager';
import { DeadCodeDetector } from '../graph/deadCodeDetector';
import { FileParseResult } from '../types';

console.log('================================================================');
console.log('🌟 Testing FunctionGraph v0.2.2: Usages, Dead Code & Contrast');
console.log('================================================================\n');

// 构造深层学习/常规 Python 脚本代码：包含顶层直接调用的函数与从未被调用的孤立函数
const sampleScript = `
def denormalize(tensor):
    """还原归一化图像"""
    return tensor * 255.0

def generate_pgd_attack(model, x, y):
    """执行 PGD 对抗样本攻击"""
    return x + 0.1

def unused_helper_function():
    """从未被引用的孤立死函数"""
    return 42

# 模块顶层直接调用 (常见于深度学习训练/评测脚本或 if __name__ == '__main__':)
img = denormalize(None)
adv_img = generate_pgd_attack(None, img, None)
`;

console.log('[Test 1] 验证 Python 顶层脚本直接调用的 UsageSite 采集与解析...');
const parseRes = parsePythonFile(sampleScript, 'scripts/pgd_eval.py');
const parseMap = new Map<string, FileParseResult>([['scripts/pgd_eval.py', parseRes]]);

const edges = resolveImportsAndRelations(parseMap);

const denormSym = parseRes.symbols.find(s => s.name === 'denormalize')!;
const pgdSym = parseRes.symbols.find(s => s.name === 'generate_pgd_attack')!;
const unusedSym = parseRes.symbols.find(s => s.name === 'unused_helper_function')!;

assert.ok(denormSym, 'denormalize 符号必须存在');
assert.ok(pgdSym, 'generate_pgd_attack 符号必须存在');
assert.ok(unusedSym, 'unused_helper_function 符号必须存在');

// 校验 usages 列表
assert.ok(denormSym.usages && denormSym.usages.length > 0, 'denormalize 必须记录顶层调用的 usage');
assert.strictEqual(denormSym.usages[0].isTopLevelScript, true, 'isTopLevelScript 必须为 true');
assert.strictEqual(denormSym.usageCount, 1, 'usageCount 必须为 1');
console.log(`  ✓ denormalize 采集到 ${denormSym.usages.length} 处调用: ${denormSym.usages[0].callerName} 行 ${denormSym.usages[0].line}`);

assert.ok(pgdSym.usages && pgdSym.usages.length > 0, 'generate_pgd_attack 必须记录顶层调用的 usage');
assert.strictEqual(pgdSym.usageCount, 1, 'usageCount 必须为 1');
console.log(`  ✓ generate_pgd_attack 采集到 ${pgdSym.usages.length} 处调用: ${pgdSym.usages[0].callerName} 行 ${pgdSym.usages[0].line}`);

assert.ok(!unusedSym.usages || unusedSym.usages.length === 0, 'unused_helper_function 不得有任何 usage');
console.log('  ✓ 顶层脚本调用的 usages 与 usageCount 校验全部通过！');

console.log('\n[Test 2] 验证 DeadCodeDetector 孤立死代码检测准确性 (防误报)...');
const graphManager = new GraphManager();
graphManager.loadWorkspace(parseRes.symbols, edges);

const deadCandidates = DeadCodeDetector.detect(graphManager, { updateNodeFlag: true });
const deadIds = new Set(deadCandidates.map(c => c.id));

assert.strictEqual(deadIds.has(denormSym.id), false, 'denormalize 在顶层被调用，绝对不能被判定为死代码！');
assert.strictEqual(denormSym.isDeadCodeCandidate, false, 'denormalize 的 isDeadCodeCandidate 必须为 false');

assert.strictEqual(deadIds.has(pgdSym.id), false, 'generate_pgd_attack 在顶层被调用，绝对不能被判定为死代码！');
assert.strictEqual(pgdSym.isDeadCodeCandidate, false, 'generate_pgd_attack 的 isDeadCodeCandidate 必须为 false');

assert.strictEqual(deadIds.has(unusedSym.id), true, 'unused_helper_function 全局未引用，必须准确识别为孤立死代码！');
assert.strictEqual(unusedSym.isDeadCodeCandidate, true, 'unused_helper_function 的 isDeadCodeCandidate 必须为 true');
console.log('  ✓ 被顶层直接调用的函数不再被误判为孤立！真正孤立的函数被准确捕获！');

console.log('\n================================================================');
console.log('🎉 ALL v0.2.2 TEST SUITES PASSED (2/2)!');
console.log('================================================================\n');
