import * as assert from 'assert';
import { getWebviewContent } from '../webview/uiHtml';
import { OllamaClient } from '../ai/ollamaClient';
import { AiCacheManager } from '../ai/cacheManager';

console.log('================================================================');
console.log('🌟 Testing CodeAtlas Architecture v0.3.1: Settings Modal, Micro-batch & Cache');
console.log('================================================================\n');

// 1. 测试 Webview HTML 结构
console.log('[Test 1] 验证独立图谱 Tab 已彻底下线，导航切换为 2-Tab 模式...');
const html = getWebviewContent('test-nonce');

// 确认独立图谱 tab 彻底被移除
assert.strictEqual(html.includes('id="tab-graph"'), false, 'id="tab-graph" 应已被移除');
assert.strictEqual(html.includes('id="panel-graph"'), false, 'id="panel-graph" 应已被移除');
assert.strictEqual(html.includes('id="canvas-container"'), false, '画布容器应已被移除');

// 确认双 Tab 架构
assert.ok(html.includes('id="tab-tree"'), '必须包含架构树 Tab');
assert.ok(html.includes('id="tab-card"'), '必须包含详情 Tab');
assert.ok(html.includes('架构树'), '架构树文本正确');
assert.ok(html.includes('详情'), '详情文本正确');
console.log('  ✓ 独立图谱 Tab 已彻底移除，成功切换为 [ 架构树 ] + [ 详情 ] 双 Tab 架构！');

// 2. 测试复制 Prompt 按钮彻底移除
console.log('\n[Test 2] 验证复制 Prompt 按钮彻底移除...');
assert.strictEqual(html.includes('btn-copy-ai'), false, 'btn-copy-ai 必须彻底移除');
assert.strictEqual(html.includes('btn-copy-file-prompt'), false, 'btn-copy-file-prompt 必须彻底移除');
assert.strictEqual(html.includes('复制 Prompt'), false, '界面上不应有“复制 Prompt”按钮');
console.log('  ✓ 复制 Prompt 按钮已彻底移除！');

// 3. 测试 AI 报告名称与排版锁死问题
console.log('\n[Test 3] 验证 AI 报告名称统一为 "AI 报告"，且无高度锁死...');
assert.ok(html.includes('AI 报告'), '必须将卡片标题命名为简洁的 "AI 报告"');
assert.strictEqual(html.includes('本地 AI 深度架构契约报告'), false, '冗长的旧标题已移除');
assert.ok(html.includes('overflow: visible;'), 'AI 报告卡片 overflow 应为 visible 保证自适应完整展示');
assert.ok(html.includes('word-break: break-word;'), '支持长文本与代码断行');
console.log('  ✓ AI 报告标题已精准更新，CSS 容器高度自适应且完全展示！');

// 4. 测试 Emoji 净化与质感平衡
console.log('\n[Test 4] 验证 Emoji 表情净化，树节点采用专业极简标签...');
assert.ok(html.includes('tree-tag-folder'), '包含树目录标签样式');
assert.ok(html.includes('tree-tag-file'), '包含树文件标签样式');
assert.ok(html.includes('tree-tag-class'), '包含树类标签样式');
assert.ok(html.includes('tree-tag-func'), '包含树函数标签样式');
assert.strictEqual(html.includes('仅类 🏛️'), false, '过滤 Pill 中的类 Emoji 已清除');
assert.strictEqual(html.includes('仅函数 ⚡'), false, '过滤 Pill 中的函数 Emoji 已清除');
console.log('  ✓ Emoji 表情已全面清理，样式转为极简专业工程风格！');

// 5. 测试关系流转全面融入详情卡片
console.log('\n[Test 5] 验证调用流转与依赖关系融入详情卡片...');
assert.ok(html.includes('Call Flow & Dependencies'), '包含架构调用流转与依赖关系板块');
assert.ok(html.includes('btn-flow-jump'), '包含实体详情快速联动跳转按钮');
console.log('  ✓ 拓扑关系流转已完美融入详情卡片并支持一键下钻！');

// 6. 测试设置弹窗 (Settings Modal - 通用 OpenAI 格式)
console.log('\n[Test 6] 验证 UI 内置的通用 OpenAI 格式设置面板...');
assert.ok(html.includes('btn-open-settings'), '包含打开设置按钮');
assert.ok(html.includes('settings-modal'), '包含设置弹窗 DOM 结构');
assert.ok(html.includes('cfg-endpoint'), '包含 API Base URL 端点配置项');
assert.ok(html.includes('cfg-apikey'), '包含 API Key 密钥输入框');
assert.ok(html.includes('cfg-model'), '包含 Model 模型名称输入框');
assert.ok(html.includes('btn-cfg-test-connection'), '包含测试连接按钮');
assert.ok(html.includes('cfg-cache-enable'), '包含增量缓存开关');
assert.ok(html.includes('btn-save-settings'), '包含保存设置按钮');
console.log('  ✓ 设置弹窗 (Settings Modal) 结构与组件齐备！');

// 7. 测试 AiCacheManager MD5 内容哈希与缓存命中机制
console.log('\n[Test 7] 验证 AiCacheManager 增量哈希比对与缓存机制...');
const cacheMgr = new AiCacheManager();
const testCode = 'def add(a, b): return a + b';
const hash = AiCacheManager.computeHash(testCode);
assert.strictEqual(typeof hash, 'string');
assert.strictEqual(hash.length, 32);

cacheMgr.updateFileCache('math_utils.py', testCode, '### 数学工具模块', { add: '相加两个数' });
const hit = cacheMgr.getFileCache('math_utils.py', testCode);
assert.ok(hit, '相同源码必须 0 毫秒命中缓存');
assert.strictEqual(hit.fileSummary, '### 数学工具模块');
assert.strictEqual(hit.symbolSummaries['add'], '相加两个数');

const modifiedCode = 'def add(a, b): return a + b + 1';
const miss = cacheMgr.getFileCache('math_utils.py', modifiedCode);
assert.strictEqual(miss, null, '代码修改后缓存必须失效并触发重新分析');
console.log('  ✓ MD5 增量内容哈希与秒级缓存测试完全通过！');

// 8. 测试 Ollama 客户端参数与微批接口
console.log('\n[Test 8] 验证 Ollama 客户端配置读写与微批接口...');
const client = new OllamaClient({ endpoint: 'http://127.0.0.1:11434', numCtx: 4096, microBatchSize: 4 });
const cfg = client.getConfig();
assert.strictEqual(cfg.numCtx, 4096);
assert.strictEqual(cfg.microBatchSize, 4);

client.updateConfig({ numCtx: 8192, microBatchSize: 5 });
const updatedCfg = client.getConfig();
assert.strictEqual(updatedCfg.numCtx, 8192);
assert.strictEqual(updatedCfg.microBatchSize, 5);
console.log('  ✓ Ollama 客户端微批参数与配置动态切换完全就绪！');

console.log('\n================================================================');
console.log('🎉 ALL v0.3.1 VERIFICATION TESTS PASSED (8/8)!');
console.log('================================================================');
