const fs = require('fs');
const vm = require('vm');
const { getWebviewContent } = require('../../out/webview/uiHtml');

const html = getWebviewContent('test-nonce');
const match = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);

if (!match) {
  console.error('No script tag found!');
  process.exit(1);
}

const script = match[1];

try {
  new vm.Script(script);
  console.log('🎉 SUCCESS: Webview Script has ZERO syntax errors!');
} catch (e) {
  console.error('❌ SYNTAX ERROR FOUND:');
  console.error(e);
}
