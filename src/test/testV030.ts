import * as assert from 'assert';
import { parsePythonFile } from '../parser/pythonParser';
import { resolveImportsAndRelations, getScriptEntries, getScriptPipelines } from '../parser/importResolver';
import { MacroClusterEngine } from '../graph/macroCluster';
import { HierarchyManager } from '../graph/hierarchyManager';
import { FileParseResult } from '../types';

console.log('================================================================');
console.log('🌟 Testing FunctionGraph v0.3.0: Macro Flow, Bare Scripts & Tree');
console.log('================================================================\n');

// 1. 测试无 if __name__ == '__main__': 直接运行的脚本 (Bare Execution Scripts)
console.log('[Test 1] 验证无 if __name__ == "__main__": 的直接执行脚本解析与 Pipeline 提取...');
const bareScriptCode = `
import torch
from model import load_network
from utils import denormalize, save_image

net = load_network('resnet50.pth')
img = denormalize(torch.randn(1, 3, 224, 224))
save_image(img, 'output.png')
`;

const bareResult = parsePythonFile(bareScriptCode, 'train_eval.py');
assert.strictEqual(bareResult.isScriptEntry, true, '直接运行的脚本应当被标记为 isScriptEntry: true');
assert.ok(bareResult.scriptPipeline && bareResult.scriptPipeline.length >= 3, '应当提取出顶层执行管道步骤');
console.log(`  ✓ 成功识别直接运行脚本入口 train_eval.py，提取到 ${bareResult.scriptPipeline?.length} 步执行管道:`);
bareResult.scriptPipeline?.forEach(p => {
  console.log(`    Step ${p.step} (Line ${p.line}): ${p.calleeName}`);
});

// 2. 模拟根目录平铺多文件项目 (Flat root project，如用户实际工程)
console.log('\n[Test 2] 验证扁平根目录项目下的全貌图自适应改造 (Adaptive File-to-File Flow)...');
const modelCode = `
class ResNet:
    def forward(self, x):
        return x

def load_network(weights):
    return ResNet()
`;
const utilsCode = `
def denormalize(tensor):
    return tensor

def save_image(img, path):
    pass
`;

const modelResult = parsePythonFile(modelCode, 'model.py');
const utilsResult = parsePythonFile(utilsCode, 'utils.py');

const parseMap = new Map<string, FileParseResult>();
parseMap.set('train_eval.py', bareResult);
parseMap.set('model.py', modelResult);
parseMap.set('utils.py', utilsResult);

const edges = resolveImportsAndRelations(parseMap);
const scriptEntries = getScriptEntries(parseMap);
const scriptPipelines = getScriptPipelines(parseMap);

assert.ok(scriptEntries.has('train_eval.py'), 'scriptEntries 应包含 train_eval.py');
assert.strictEqual(scriptEntries.has('model.py'), false, '纯模块不应标记为 scriptEntry');

// 检查 scriptPipeline 中的 targetSymbolId 是否正确解析绑定
const trainPipeline = scriptPipelines.get('train_eval.py');
assert.ok(trainPipeline, '应该获取到 train_eval.py 的 pipeline');
const resolvedStep = trainPipeline?.find(s => s.calleeName === 'load_network');
assert.ok(resolvedStep && resolvedStep.targetSymbolId?.includes('model.py#load_network'), 'load_network 应被解析到 model.py 实体');
console.log(`  ✓ 顶层脚本 Pipeline 成功链接跨文件目标符号: load_network -> ${resolvedStep?.targetSymbolId}`);

// 3. 运行 MacroClusterEngine 检查是否自适应生成了文件间调用流图
const allSymbols = [...bareResult.symbols, ...modelResult.symbols, ...utilsResult.symbols];
const macroData = MacroClusterEngine.cluster(allSymbols, edges, scriptEntries);

console.log(`\n  Macro Graph 结果: 节点数 = ${macroData.modules.length}, 跨文件边数 = ${macroData.edges.length}`);
assert.ok(macroData.modules.length >= 2, '全貌图不应塌陷为单个根模块，应自适应展示各文件节点');
const fileKinds = macroData.modules.map(m => m.kind);
assert.ok(fileKinds.includes('file'), '节点类型应当为 file');

const trainNode = macroData.modules.find(m => m.name === 'train_eval.py');
assert.ok(trainNode && trainNode.isScriptEntry, 'train_eval.py 在全貌图中应标为 isScriptEntry: true');
console.log(`  ✓ 全貌图自适应成功！文件节点: ${macroData.modules.map(m => m.name + (m.isScriptEntry ? ' (脚本)' : '')).join(', ')}`);
console.log(`  ✓ 跨文件调用流边: ${macroData.edges.map(e => `${e.source} -> ${e.target} (${e.callWeight} calls)`).join('; ')}`);

// 4. 验证 HierarchyManager 构建的资产树
console.log('\n[Test 3] 验证 HierarchyManager 资产树对脚本入口与管道流的支持...');
const tree = HierarchyManager.buildTree(allSymbols, new Set(), scriptEntries, scriptPipelines);
assert.ok(tree.length > 0, '资产树不应为空');

function findFileInTree(nodes: any[], fileName: string): any {
  for (const n of nodes) {
    if (n.kind === 'file' && n.name === fileName) return n;
    if (n.children) {
      const found = findFileInTree(n.children, fileName);
      if (found) return found;
    }
  }
  return null;
}

const trainFileNode = findFileInTree(tree, 'train_eval.py');
assert.ok(trainFileNode, '资产树应包含 train_eval.py 节点');
assert.strictEqual(trainFileNode.isScriptEntry, true, '资产树中的文件节点应包含 isScriptEntry: true');
assert.ok(trainFileNode.scriptPipeline && trainFileNode.scriptPipeline.length >= 3, '资产树文件节点应附带 scriptPipeline');
console.log(`  ✓ 资产树节点成功携带脚本入口与执行流步骤属性！`);

console.log('\n================================================================');
console.log('🎉 ALL v0.3.0 TEST SUITES PASSED (3/3)!');
console.log('================================================================');
