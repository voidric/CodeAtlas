import * as assert from 'assert';
import { getWebviewContent } from '../webview/uiHtml';
import { AiCacheManager } from '../ai/cacheManager';
import { OllamaClient } from '../ai/ollamaClient';

console.log('================================================================');
console.log('Testing CodeAtlas v0.4.0: 4-Tier Architecture & Simplified LLM Config');
console.log('================================================================');

// 1. Webview UI 验证
const html = getWebviewContent('test-nonce-035');

console.log('\n[Test 1] 验证四层架构卡片与视图入口...');
assert.ok(html.includes('renderFolderCard'), '包含目录模块级卡片渲染函数');
assert.ok(html.includes('renderProjectCard'), '包含全工程全景资产大报告渲染函数');
assert.ok(html.includes('btn-view-project'), '包含工程全景导航入口');
assert.ok(html.includes('scope-modal'), '包含架构分析范围选择弹窗');
assert.ok(html.includes('opt-scope-all'), '包含全工程分析选项');
assert.ok(html.includes('opt-scope-folder'), '包含目录分析选项');
assert.ok(html.includes('opt-scope-file'), '包含文件分析选项');
assert.ok(html.includes('btn-start-analysis'), '包含开始分析按钮');
assert.ok(html.includes('flow-container'), '包含调用流转与依赖关系容器');
assert.ok(html.includes('btn-export-md'), '包含导出 Markdown 报告按钮');
console.log('  ✓ 四层架构视图与范围选择组件完全就绪！');

console.log('\n[Test 2] 验证通用 OpenAI 格式设置与测试连接...');
assert.ok(html.includes('cfg-endpoint'), '包含 Base URL 输入');
assert.ok(html.includes('cfg-apikey'), '包含 API Key 输入');
assert.ok(html.includes('cfg-model'), '包含 Model 输入');
assert.ok(html.includes('btn-cfg-test-connection'), '包含测试连接按钮');
assert.ok(html.includes('cfg-test-result'), '包含测试结果状态提示');
assert.ok(html.includes('cfg-cache-enable'), '包含增量缓存开关');
assert.ok(html.includes('btn-clear-cache'), '包含清空缓存按钮');
console.log('  ✓ 通用 OpenAI 格式大模型设置完全就绪！');

console.log('\n[Test 3] 验证多层级架构持久化缓存机制...');
const cacheMgr = new AiCacheManager();
cacheMgr.setProjectSummary('### 全工程架构全景大报告内容');
assert.strictEqual(cacheMgr.getProjectSummary(), '### 全工程架构全景大报告内容');

cacheMgr.setFolderSummary('services/order', '### 订单模块领域综述');
assert.strictEqual(cacheMgr.getFolderSummary('services/order'), '### 订单模块领域综述');
const allFolders = cacheMgr.getAllFolderSummaries();
assert.strictEqual(allFolders['services/order'], '### 订单模块领域综述');
console.log('  ✓ 项目全景与目录模块综述缓存读写验证通过！');

console.log('\n[Test 4] 验证通用大模型客户端接口...');
const client = new OllamaClient({
  endpoint: 'http://127.0.0.1:11434/v1',
  apiKey: 'test-token',
  selectedModel: 'qwen2.5-coder:7b'
});
const cfg = client.getConfig();
assert.strictEqual(cfg.endpoint, 'http://127.0.0.1:11434/v1');
assert.strictEqual(cfg.apiKey, 'test-token');
assert.strictEqual(cfg.selectedModel, 'qwen2.5-coder:7b');
console.log('  ✓ OllamaClient 通用 OpenAI 兼容契约测试通过！');

console.log('\n================================================================');
console.log('🎉 ALL v0.3.5 SPECIFICATION TESTS PASSED (4/4)!');
console.log('================================================================\n');
