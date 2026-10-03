import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import {
  cleanDocstring,
  extractDocstringSections,
  parseDocstring
} from '../parser/docstringParser';
import {
  parseParameters,
  parseReturnType,
  inferReturnTypeFromBody,
  splitTopLevel
} from '../parser/signatureParser';
import { parsePythonFile } from '../parser/pythonParser';
import { resolveImportsAndRelations, ImportResolver } from '../parser/importResolver';
import { FileParseResult } from '../types';

let totalTests = 0;
let passedTests = 0;

function test(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
  }
}

console.log('====================================================');
console.log('FunctionGraph Python AST & Resolver Unit Tests');
console.log('====================================================\n');

// -----------------------------------------------------------------
// Test Suite 1: docstringParser
// -----------------------------------------------------------------
console.log('--- Test Suite 1: docstringParser ---');

test('Google style docstring parsing with summary, description, params, returns', () => {
  const doc = `
    """
    计算折后最终价格
    这是多行详细说明第二行。
    Args:
        price: 原始单价
        discount_rate (float): 折扣率 (0~1)
    Returns:
        折后价格
    """
  `;
  const info = parseDocstring(doc);
  assert.ok(info);
  assert.strictEqual(info?.summary, '计算折后最终价格');
  assert.strictEqual(info?.description, '这是多行详细说明第二行。');
  assert.ok(info?.params);
  assert.strictEqual(info?.params?.['price'], '原始单价');
  assert.strictEqual(info?.params?.['discount_rate'], '(float) 折扣率 (0~1)');
  assert.strictEqual(info?.returns, '折后价格');
});

test('Sphinx style docstring parsing with :param and :return:', () => {
  const doc = `
    """
    Sphinx 风格函数说明
    :param str name: 用户姓名
    :param age: 用户年龄
    :return: 结果字典
    """
  `;
  const info = parseDocstring(doc);
  assert.ok(info);
  assert.strictEqual(info?.summary, 'Sphinx 风格函数说明');
  assert.strictEqual(info?.params?.['name'], '用户姓名');
  assert.strictEqual(info?.params?.['age'], '用户年龄');
  assert.strictEqual(info?.returns, '结果字典');
});

test('Single line docstring parsing', () => {
  const doc = '"""获取当前实体的唯一标识"""';
  const info = parseDocstring(doc);
  assert.ok(info);
  assert.strictEqual(info?.summary, '获取当前实体的唯一标识');
  assert.strictEqual(info?.description, undefined);
  assert.strictEqual(info?.params, undefined);
  assert.strictEqual(info?.returns, undefined);
});

test('Fallback to leading comments when docstring is absent', () => {
  const comments = [
    '# 用于死函数检测测试：全项目无调用的孤立函数',
    '# 详细说明行：预期被 Dead Code Radar 检测出'
  ];
  const info = parseDocstring(undefined, comments);
  assert.ok(info);
  assert.strictEqual(info?.summary, '用于死函数检测测试：全项目无调用的孤立函数');
  assert.strictEqual(info?.description, '详细说明行：预期被 Dead Code Radar 检测出');
});

test('Empty or blank docstring returns undefined', () => {
  assert.strictEqual(parseDocstring('"""  """'), undefined);
  assert.strictEqual(parseDocstring(''), undefined);
  assert.strictEqual(parseDocstring(undefined, []), undefined);
});

// -----------------------------------------------------------------
// Test Suite 2: signatureParser
// -----------------------------------------------------------------
console.log('\n--- Test Suite 2: signatureParser ---');

test('Parse mixed parameters: positional, keyword, defaults, *args, **kwargs', () => {
  const paramStr = 'user_id: str, email: str, is_active: bool = True, *args: str, **kwargs: Any';
  const params = parseParameters(paramStr);
  assert.strictEqual(params.length, 5);

  assert.strictEqual(params[0].name, 'user_id');
  assert.strictEqual(params[0].typeHint, 'str');
  assert.strictEqual(params[0].kind, 'positional');

  assert.strictEqual(params[1].name, 'email');
  assert.strictEqual(params[1].typeHint, 'str');
  assert.strictEqual(params[1].kind, 'positional');

  assert.strictEqual(params[2].name, 'is_active');
  assert.strictEqual(params[2].typeHint, 'bool');
  assert.strictEqual(params[2].defaultValue, 'True');
  assert.strictEqual(params[2].kind, 'keyword');

  assert.strictEqual(params[3].name, 'args');
  assert.strictEqual(params[3].typeHint, 'str');
  assert.strictEqual(params[3].kind, 'args');

  assert.strictEqual(params[4].name, 'kwargs');
  assert.strictEqual(params[4].typeHint, 'Any');
  assert.strictEqual(params[4].kind, 'kwargs');
});

test('Parse parameters with complex generics and nested commas', () => {
  const paramStr = 'order_id: str, items: Optional[List[str]] = None, config: Dict[str, Union[int, str]] = {"key": "val,with,comma"}';
  const params = parseParameters(paramStr);
  assert.strictEqual(params.length, 3);
  assert.strictEqual(params[1].name, 'items');
  assert.strictEqual(params[1].typeHint, 'Optional[List[str]]');
  assert.strictEqual(params[1].defaultValue, 'None');
  assert.strictEqual(params[2].name, 'config');
  assert.strictEqual(params[2].typeHint, 'Dict[str, Union[int, str]]');
  assert.strictEqual(params[2].defaultValue, '{"key": "val,with,comma"}');
});

test('Parse keyword-only delimiter * and positional-only /', () => {
  const paramStr = 'x: int, /, y: int = 1, *, z: str';
  const params = parseParameters(paramStr);
  assert.strictEqual(params.length, 3);
  assert.strictEqual(params[0].name, 'x');
  assert.strictEqual(params[0].kind, 'positional');
  assert.strictEqual(params[1].name, 'y');
  assert.strictEqual(params[1].kind, 'keyword');
  assert.strictEqual(params[2].name, 'z');
  assert.strictEqual(params[2].kind, 'keyword');
});

test('Parse explicit return types', () => {
  assert.strictEqual(parseReturnType('-> bool:'), 'bool');
  assert.strictEqual(parseReturnType('-> Optional[List[str]]:'), 'Optional[List[str]]');
  assert.strictEqual(parseReturnType('dict'), 'dict');
});

test('Infer literal return types from function body', () => {
  assert.strictEqual(inferReturnTypeFromBody('return True'), 'bool');
  assert.strictEqual(inferReturnTypeFromBody('return "hello world"'), 'str');
  assert.strictEqual(inferReturnTypeFromBody('return 42'), 'int');
  assert.strictEqual(inferReturnTypeFromBody('return 3.14'), 'float');
  assert.strictEqual(inferReturnTypeFromBody('return [1, 2, 3]'), 'list');
  assert.strictEqual(inferReturnTypeFromBody('return {"key": "value"}'), 'dict');
  assert.strictEqual(inferReturnTypeFromBody('return (1, 2)'), 'tuple');
  assert.strictEqual(inferReturnTypeFromBody('return None'), 'None');
  assert.strictEqual(
    inferReturnTypeFromBody('return "@" in self.email and "." in self.email'),
    'bool'
  );
  assert.strictEqual(
    inferReturnTypeFromBody('return (x * 42) + (y // 7)'),
    'int'
  );
});

// -----------------------------------------------------------------
// Test Suite 3: pythonParser & importResolver on sample_project
// -----------------------------------------------------------------
console.log('\n--- Test Suite 3: sample_project Integration Test ---');

const projectRoot = path.resolve(__dirname, '../../');
const sampleFiles = [
  'sample_project/models.py',
  'sample_project/utils/calculator.py',
  'sample_project/services/payment_service.py',
  'sample_project/services/order_service.py',
  'sample_project/main.py'
];

const parseResultsMap = new Map<string, FileParseResult>();

for (const relPath of sampleFiles) {
  const fullPath = path.join(projectRoot, relPath);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const result = parsePythonFile(content, relPath);
    parseResultsMap.set(relPath, result);
  } else {
    console.error(`Sample file not found: ${fullPath}`);
  }
}

test('Verify models.py classes, inheritance, and methods', () => {
  const modelsRes = parseResultsMap.get('sample_project/models.py');
  assert.ok(modelsRes);

  const classes = modelsRes?.symbols.filter(s => s.kind === 'class');
  assert.strictEqual(classes?.length, 3);

  const baseEntity = classes?.find(c => c.name === 'BaseEntity');
  assert.ok(baseEntity);
  assert.strictEqual(baseEntity?.id, 'sample_project/models.py#BaseEntity');
  assert.strictEqual(baseEntity?.docstring?.summary, '系统实体基础抽象类');

  const user = classes?.find(c => c.name === 'User');
  assert.ok(user);
  assert.deepStrictEqual((user as any).bases, ['BaseEntity']);
  assert.ok((user as any).methods.includes('sample_project/models.py#User.validate_email'));
  assert.ok((user as any).methods.includes('sample_project/models.py#User.deactivate'));

  const order = classes?.find(c => c.name === 'Order');
  assert.ok(order);
  assert.deepStrictEqual((order as any).bases, ['BaseEntity']);
  assert.ok((order as any).methods.includes('sample_project/models.py#Order.mark_as_paid'));
});

test('Verify calculator.py functions and docstrings', () => {
  const calcRes = parseResultsMap.get('sample_project/utils/calculator.py');
  assert.ok(calcRes);

  const funcs = calcRes?.symbols.filter(s => s.kind === 'function');
  assert.strictEqual(funcs?.length, 3);

  const discount = funcs?.find(f => f.name === 'calculate_discount');
  assert.ok(discount);
  assert.strictEqual(discount?.docstring?.summary, '计算折后最终价格');
  assert.strictEqual(discount?.docstring?.params?.['price'], '原始单价');
  assert.strictEqual(discount?.docstring?.returns, '折后价格');

  const unused = funcs?.find(f => f.name === 'unused_legacy_formula');
  assert.ok(unused);
  assert.strictEqual(unused?.docstring?.summary, '废弃的历史计算公式，预期被 Dead Code Radar 检测出');
});

test('Verify order_service.py imports and call sites extraction', () => {
  const orderRes = parseResultsMap.get('sample_project/services/order_service.py');
  assert.ok(orderRes);

  // 检查 import 解析
  const imports = orderRes?.imports || [];
  assert.ok(imports.some(i => i.importedSymbol === 'User' && i.isRelative));
  assert.ok(imports.some(i => i.importedSymbol === 'Order' && i.isRelative));
  assert.ok(imports.some(i => i.importedSymbol === 'calculate_discount'));
  assert.ok(imports.some(i => i.importedSymbol === 'process_checkout_payment'));

  // 检查 call sites
  const calls = orderRes?.callSites || [];
  const callees = calls.map(c => c.calleeName);
  assert.ok(callees.includes('User'));
  assert.ok(callees.includes('user.validate_email'));
  assert.ok(callees.includes('calculate_discount'));
  assert.ok(callees.includes('Order'));
  assert.ok(callees.includes('process_checkout_payment'));
  assert.ok(callees.includes('order.get_id'));
  assert.ok(callees.includes('order.mark_as_paid'));
});

test('Verify cross-file symbol resolution and relation edges', () => {
  const edges = resolveImportsAndRelations(parseResultsMap);
  assert.ok(edges.length > 0);

  // 1. contains 边
  const containsEdges = edges.filter(e => e.kind === 'contains');
  assert.ok(containsEdges.some(e => e.source === 'sample_project/models.py#User' && e.target === 'sample_project/models.py#User.validate_email'));
  assert.ok(containsEdges.some(e => e.source === 'sample_project/models.py#Order' && e.target === 'sample_project/models.py#Order.mark_as_paid'));
  assert.ok(containsEdges.some(e => e.source === 'sample_project/models.py#BaseEntity' && e.target === 'sample_project/models.py#BaseEntity.get_id'));

  // 2. inherits 边
  const inheritEdges = edges.filter(e => e.kind === 'inherits');
  assert.ok(inheritEdges.some(e => e.source === 'sample_project/models.py#User' && e.target === 'sample_project/models.py#BaseEntity'));
  assert.ok(inheritEdges.some(e => e.source === 'sample_project/models.py#Order' && e.target === 'sample_project/models.py#BaseEntity'));

  // 3. instantiates 边
  const instantiateEdges = edges.filter(e => e.kind === 'instantiates');
  assert.ok(instantiateEdges.some(e => e.source === 'sample_project/services/order_service.py#checkout_order' && e.target === 'sample_project/models.py#User'));
  assert.ok(instantiateEdges.some(e => e.source === 'sample_project/services/order_service.py#checkout_order' && e.target === 'sample_project/models.py#Order'));
  assert.ok(instantiateEdges.some(e => e.source === 'sample_project/services/payment_service.py#process_checkout_payment' && e.target === 'sample_project/services/payment_service.py#PaymentProcessor'));

  // 4. calls 边
  const callEdges = edges.filter(e => e.kind === 'calls');
  assert.ok(callEdges.some(e => e.source === 'sample_project/main.py#start_application' && e.target === 'sample_project/services/order_service.py#checkout_order'));
  assert.ok(callEdges.some(e => e.source === 'sample_project/services/order_service.py#checkout_order' && e.target === 'sample_project/utils/calculator.py#calculate_discount'));
  assert.ok(callEdges.some(e => e.source === 'sample_project/services/order_service.py#checkout_order' && e.target === 'sample_project/services/payment_service.py#process_checkout_payment'));
  assert.ok(callEdges.some(e => e.source === 'sample_project/services/order_service.py#checkout_order' && e.target === 'sample_project/models.py#User.validate_email'));
  assert.ok(callEdges.some(e => e.source === 'sample_project/services/order_service.py#checkout_order' && e.target === 'sample_project/models.py#Order.mark_as_paid'));
  assert.ok(callEdges.some(e => e.source === 'sample_project/services/order_service.py#checkout_order' && e.target === 'sample_project/models.py#BaseEntity.get_id'));
  assert.ok(callEdges.some(e => e.source === 'sample_project/models.py#User.__init__' && e.target === 'sample_project/models.py#BaseEntity.__init__'));
  assert.ok(callEdges.some(e => e.source === 'sample_project/services/payment_service.py#PaymentProcessor.execute_payment' && e.target === 'sample_project/utils/calculator.py#calculate_tax'));
});

test('Verify Dead Code Radar candidate marking', () => {
  // 运行关系构建与死代码计算
  resolveImportsAndRelations(parseResultsMap);

  const calcRes = parseResultsMap.get('sample_project/utils/calculator.py');
  const unusedFunc = calcRes?.symbols.find(s => s.name === 'unused_legacy_formula');
  const discountFunc = calcRes?.symbols.find(s => s.name === 'calculate_discount');

  assert.strictEqual(unusedFunc?.isDeadCodeCandidate, true, 'unused_legacy_formula should be dead code');
  assert.strictEqual(discountFunc?.isDeadCodeCandidate, false, 'calculate_discount should NOT be dead code');

  const mainRes = parseResultsMap.get('sample_project/main.py');
  const abandonedCron = mainRes?.symbols.find(s => s.name === 'abandoned_backup_cron');
  const startApp = mainRes?.symbols.find(s => s.name === 'start_application');

  assert.strictEqual(abandonedCron?.isDeadCodeCandidate, true, 'abandoned_backup_cron should be dead code');
  assert.strictEqual(startApp?.isDeadCodeCandidate, false, 'start_application should NOT be dead code (called in __main__)');

  const modelsRes = parseResultsMap.get('sample_project/models.py');
  const deactivateMethod = modelsRes?.symbols.find(s => s.name === 'deactivate');
  assert.strictEqual(deactivateMethod?.isDeadCodeCandidate, true, 'deactivate should be dead code (no calls)');
});

console.log(`\n====================================================`);
console.log(`Test Results: ${passedTests}/${totalTests} Passed.`);
console.log(`====================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
