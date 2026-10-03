/**
 * 本地 Ollama 客户端联调测试脚本
 */
import { OllamaClient } from '../ai/ollamaClient';

async function testOllamaIntegration() {
  console.log('Connecting to local Ollama service...');
  const client = new OllamaClient();
  const initResult = await client.init();

  console.log('Initialization Result:', initResult);

  if (!initResult.success) {
    console.error('Failed to connect to Ollama!');
    process.exit(1);
  }

  console.log(`Active Model selected: ${client.getActiveModel()}`);

  console.log('\n[Test 1] Testing Function Docstring Generation...');
  const summary = await client.generateSummary(
    'calculate_discount',
    'function',
    'def calculate_discount(price: float, discount_rate: float = 0.1) -> float',
    'return price * (1.0 - discount_rate)'
  );
  console.log(`Generated Summary: "${summary}"`);

  console.log('\n[Test 2] Testing Natural Language Search Expansion...');
  const expanded = await client.expandSearchIntent('计算订单最终折扣价格');
  console.log('Expanded Keywords:', expanded);

  console.log('\nOllama Integration Test Completed Successfully!');
}

testOllamaIntegration().catch(err => {
  console.error('Error during Ollama test:', err);
  process.exit(1);
});
