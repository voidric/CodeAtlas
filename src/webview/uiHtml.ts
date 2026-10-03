/**
 * CodeAtlas Webview UI 渲染引擎
 * 四层架构透镜：[ 架构树 ] 与 [ 详情卡片 ]
 * 极简专业工程化界面设计
 */

export function getWebviewContent(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeAtlas 架构中心</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #d4d4d4);
      --fg-sub: var(--vscode-descriptionForeground, #888888);
      --card-bg: var(--vscode-sideBar-background, #252526);
      --card-border: var(--vscode-panel-border, #3e3e42);
      --hover-bg: var(--vscode-list-hoverBackground, rgba(255,255,255,0.06));
      --active-bg: var(--vscode-list-activeSelectionBackground, rgba(0, 122, 204, 0.25));
      --accent: var(--vscode-button-background, #007acc);
      --accent-hover: var(--vscode-button-hoverBackground, #0062a3);
      --font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
      --code-font: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
    }

    body.vscode-light {
      --bg: var(--vscode-editor-background, #ffffff);
      --fg: var(--vscode-editor-foreground, #1f2328);
      --fg-sub: var(--vscode-descriptionForeground, #59636e);
      --card-bg: var(--vscode-sideBar-background, #f6f8fa);
      --card-border: var(--vscode-panel-border, #d0d7de);
      --hover-bg: var(--vscode-list-hoverBackground, #eaeef2);
      --active-bg: var(--vscode-list-activeSelectionBackground, #ddf4ff);
    }

    body.vscode-dark {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #d4d4d4);
      --fg-sub: var(--vscode-descriptionForeground, #9da5b4);
      --card-bg: var(--vscode-sideBar-background, #252526);
      --card-border: var(--vscode-panel-border, #3e3e42);
      --hover-bg: rgba(255,255,255,0.06);
      --active-bg: rgba(0, 122, 204, 0.3);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--fg);
      font-family: var(--font-family);
      font-size: 12px;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      user-select: none;
    }

    /* 顶部主工具栏 */
    .toolbar {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px 10px;
      background: var(--card-bg);
      border-bottom: 1px solid var(--card-border);
      z-index: 20;
    }
    .search-row {
      display: flex;
      width: 100%;
      gap: 6px;
    }
    .search-row {
      position: relative;
      display: flex;
      align-items: center;
      width: 100%;
    }
    .search-input {
      flex: 1;
      width: 100%;
      min-width: 0;
      padding: 5px 24px 5px 9px;
      background: var(--vscode-input-background, #3c3c3c);
      color: var(--fg);
      border: 1px solid var(--vscode-input-border, #555);
      border-radius: 4px;
      font-family: var(--font-family);
      font-size: 11px;
      outline: none;
    }
    .search-input:focus { border-color: var(--accent); }
    .search-clear-btn {
      position: absolute;
      right: 6px;
      background: transparent;
      border: none;
      color: var(--fg-sub);
      font-size: 11px;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 2px;
      transition: color 0.15s, background 0.15s;
    }
    .search-clear-btn:hover {
      color: var(--fg);
      background: var(--hover-bg);
    }
    .search-results-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      max-height: 420px;
      overflow-y: auto;
      background: var(--card-bg);
      border: 1px solid var(--accent);
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      z-index: 1000;
      display: flex;
      flex-direction: column;
    }
    .search-results-header {
      padding: 6px 10px;
      background: rgba(0, 122, 204, 0.15);
      border-bottom: 1px solid var(--card-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 600;
      color: var(--fg);
    }
    .search-results-close {
      cursor: pointer;
      color: var(--fg-sub);
      font-size: 12px;
      padding: 0 4px;
      border-radius: 2px;
    }
    .search-results-close:hover {
      color: var(--fg);
      background: var(--hover-bg);
    }
    .search-results-list {
      display: flex;
      flex-direction: column;
      padding: 4px;
      gap: 3px;
      overflow-y: auto;
    }
    .search-result-item {
      padding: 6px 8px;
      border-radius: 4px;
      border: 1px solid transparent;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 3px;
      transition: background 0.12s, border-color 0.12s;
    }
    .search-result-item:hover {
      background: var(--hover-bg);
      border-color: var(--accent);
    }
    .search-result-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .search-result-name-group {
      display: flex;
      align-items: center;
      gap: 5px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .search-result-name {
      font-family: var(--code-font);
      font-weight: 700;
      font-size: 11px;
      color: var(--fg);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .search-result-score {
      font-size: 9px;
      color: var(--accent);
      background: rgba(0, 122, 204, 0.1);
      border: 1px solid rgba(0, 122, 204, 0.25);
      border-radius: 2px;
      padding: 1px 4px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .search-result-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      font-size: 10px;
    }
    .search-result-path {
      color: var(--fg-sub);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--code-font);
      font-size: 9.5px;
    }
    .search-result-reason {
      font-size: 9.5px;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.2);
      border-radius: 2px;
      padding: 1px 4px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .search-result-sig {
      font-size: 9.5px;
      color: var(--fg-sub);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--code-font);
    }
    .search-result-summary {
      font-size: 10px;
      color: var(--fg-sub);
      line-height: 1.3;
      padding: 3px 6px;
      background: rgba(0, 0, 0, 0.15);
      border-radius: 2px;
      border-left: 2px solid var(--accent);
    }

    /* 双态主导航 Tab */
    .tab-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
      width: 100%;
    }
    .tab-group-left {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .tab-group-right {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
    }
    .tab-btn {
      padding: 3px 10px;
      font-size: 11px;
      border-radius: 3px;
      background: transparent;
      border: 1px solid var(--card-border);
      color: var(--fg);
      cursor: pointer;
      white-space: nowrap !important;
      transition: background 0.15s, border-color 0.15s;
    }
    .tab-btn.active {
      background: var(--accent);
      color: #fff !important;
      border-color: var(--accent);
      font-weight: 600;
    }
    .btn-icon {
      padding: 3px 7px;
      background: transparent;
      border: 1px solid var(--card-border);
      color: var(--fg);
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      white-space: nowrap;
    }
    .btn-icon:hover { background: var(--hover-bg); }

    /* 主体视口容器 */
    .views-viewport {
      flex: 1;
      position: relative;
      overflow: hidden;
      display: flex;
    }
    .tab-panel {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: none;
      flex-direction: column;
      background: var(--bg);
      overflow: hidden;
    }
    .tab-panel.active {
      display: flex;
    }

    /* 架构资产树视图 */
    .tree-toolbar {
      padding: 6px 10px;
      background: var(--card-bg);
      border-bottom: 1px solid var(--card-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      font-size: 11px;
    }
    .tree-filter-pills {
      display: flex;
      gap: 4px;
    }
    .filter-pill {
      padding: 2px 7px;
      border-radius: 3px;
      font-size: 10px;
      cursor: pointer;
      background: transparent;
      border: 1px solid var(--card-border);
      color: var(--fg-sub);
    }
    .filter-pill.active {
      background: var(--hover-bg);
      color: var(--fg);
      border-color: var(--accent);
      font-weight: 600;
    }
    .tree-stats {
      font-size: 10px;
      color: var(--fg-sub);
      white-space: nowrap;
    }

    .tree-container {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 6px 6px 30px 6px;
    }
    .tree-node-row {
      display: flex;
      align-items: center;
      padding: 3px 6px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      line-height: 1.4;
      white-space: nowrap;
      transition: background 0.1s;
    }
    .tree-node-row:hover {
      background: var(--hover-bg);
    }
    .tree-node-row.selected {
      background: rgba(0, 122, 204, 0.15) !important;
      border-left: 3px solid #007acc !important;
      border-radius: 0 4px 4px 0;
    }
    .tree-node-row.selected .tree-label {
      color: var(--fg) !important;
      font-weight: 700;
    }
    body.vscode-dark .tree-node-row.selected {
      background: rgba(56, 189, 248, 0.18) !important;
      border-left: 3px solid #38bdf8 !important;
    }

    .tree-chevron {
      width: 14px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      color: var(--fg-sub);
      margin-right: 3px;
      transition: transform 0.15s;
    }
    .tree-chevron.expanded {
      transform: rotate(90deg);
    }
    .tree-chevron.leaf {
      visibility: hidden;
    }

    /* 文本标签体系 */
    .tree-tag {
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 2px;
      font-weight: 600;
      margin-right: 5px;
      flex-shrink: 0;
      font-family: var(--font-family);
    }
    .tree-tag-folder { color: var(--fg-sub); background: var(--hover-bg); border: 1px solid var(--card-border); }
    .tree-tag-file { color: #0284c7; background: rgba(2, 132, 199, 0.12); border: 1px solid rgba(2, 132, 199, 0.25); }
    .tree-tag-script { color: #8b5cf6; background: rgba(139, 92, 246, 0.12); border: 1px solid rgba(139, 92, 246, 0.25); }
    .tree-tag-class { color: #2563eb; background: rgba(37, 99, 235, 0.12); border: 1px solid rgba(37, 99, 235, 0.25); }
    .tree-tag-func { color: #10b981; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.25); }
    .tree-tag-method { color: #06b6d4; background: rgba(6, 182, 212, 0.12); border: 1px solid rgba(6, 182, 212, 0.25); }
    .tree-dead-tag {
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 2px;
      background: rgba(234, 88, 12, 0.15);
      color: #ea580c;
      border: 1px solid rgba(234, 88, 12, 0.35);
      margin-left: 4px;
      font-weight: 600;
    }

    .tree-label {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-right: 6px;
      font-family: var(--code-font);
    }
    .tree-badge {
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 3px;
      color: var(--fg-sub);
      background: var(--hover-bg);
      border: 1px solid var(--card-border);
      flex-shrink: 0;
    }
    .tree-children {
      margin-left: 14px;
      border-left: 1px solid var(--card-border);
      padding-left: 2px;
    }
    .tree-children.collapsed {
      display: none;
    }

    /* 详情卡片面板 (Contract Inspector) */
    .contract-body {
      flex: 1;
      padding: 16px 18px 80px 18px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-sizing: border-box;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      font-size: 10px;
      border-radius: 3px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-func { background: rgba(16, 185, 129, 0.15); color: #059669; border: 1px solid #10b981; }
    .badge-class { background: rgba(59, 130, 246, 0.15); color: #2563eb; border: 1px solid #3b82f6; }
    .badge-method { background: rgba(139, 92, 246, 0.15); color: #7c3aed; border: 1px solid #8b5cf6; }

    .symbol-name-banner {
      font-family: var(--code-font);
      font-size: 15px;
      font-weight: 700;
      color: var(--fg);
      word-break: break-all;
    }
    .code-location {
      font-size: 11px;
      cursor: pointer;
      color: var(--accent);
      text-decoration: underline;
    }
    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--fg-sub);
      margin-bottom: 6px;
    }
    .doc-box {
      background: var(--vscode-textBlockQuote-background, rgba(128,128,128,0.08));
      border-left: 3px solid var(--accent);
      padding: 8px 10px;
      border-radius: 2px 4px 4px 2px;
      font-size: 12px;
      line-height: 1.5;
      color: var(--fg);
    }
    .doc-summary { font-weight: 600; color: var(--fg); margin-bottom: 4px; }
    .doc-desc { color: var(--fg-sub); white-space: pre-wrap; font-size: 11px; }

    .param-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    .param-table th, .param-table td {
      padding: 6px 8px;
      text-align: left;
      border-bottom: 1px solid var(--card-border);
      color: var(--fg);
    }
    .param-table th { color: var(--fg-sub); font-weight: 600; }
    .param-type { color: #0284c7; font-family: var(--code-font); font-weight: 600; }
    .param-default { color: #ea580c; font-family: var(--code-font); }

    .btn {
      padding: 6px 12px;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      justify-content: center;
      transition: background 0.15s;
    }
    .btn:hover { background: var(--accent-hover); }
    .btn-secondary {
      background: transparent;
      border: 1px solid var(--card-border);
      color: var(--fg);
      padding: 4px 8px;
      font-size: 11px;
      border-radius: 3px;
      cursor: pointer;
    }
    .btn-secondary:hover { background: var(--hover-bg); }

    .badge-usage {
      background: rgba(16, 185, 129, 0.15) !important;
      color: #10b981 !important;
      border: 1px solid rgba(16, 185, 129, 0.4) !important;
    }
    .badge-orphan {
      background: rgba(234, 88, 12, 0.15) !important;
      color: #ea580c !important;
      border: 1px solid rgba(234, 88, 12, 0.4) !important;
    }
    .usage-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 220px;
      overflow-y: auto;
    }
    .usage-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 10px;
      background: var(--vscode-editor-background, rgba(0,0,0,0.1));
      border: 1px solid var(--card-border);
      border-radius: 4px;
      font-size: 11px;
      transition: border-color 0.15s, background 0.15s;
    }
    .usage-item:hover {
      border-color: var(--accent);
      background: var(--hover-bg);
    }
    .usage-left {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }
    .usage-caller {
      font-weight: 600;
      font-family: var(--code-font);
      color: var(--fg);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .usage-pill-toplevel {
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 2px;
      background: rgba(139, 92, 246, 0.15);
      color: #8b5cf6;
      border: 1px solid rgba(139, 92, 246, 0.3);
      flex-shrink: 0;
      font-weight: 600;
    }
    .usage-pill-fn {
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 2px;
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
      border: 1px solid rgba(16, 185, 129, 0.3);
      flex-shrink: 0;
      font-weight: 600;
    }
    .usage-snippet {
      font-family: var(--code-font);
      color: var(--fg-sub);
      font-size: 10px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .usage-snippet code {
      background: var(--hover-bg);
      padding: 1px 3px;
      border-radius: 2px;
    }
    .usage-link {
      cursor: pointer;
      font-family: var(--code-font);
      font-size: 10px;
      color: var(--accent);
      text-decoration: underline;
      display: inline-flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
    }
    .usage-link:hover { color: var(--accent-hover); }

    .usage-empty-box {
      background: var(--vscode-editor-background, rgba(0,0,0,0.1));
      border: 1px dashed var(--card-border);
      border-radius: 4px;
      padding: 10px 12px;
    }

    /* 架构调用流转与依赖关系 (Call Flow & Dependencies) */
    .flow-container {
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: var(--vscode-editor-background, rgba(0,0,0,0.1));
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 12px;
    }
    .flow-section-title {
      font-size: 10px;
      font-weight: 700;
      color: var(--fg-sub);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
    }
    .flow-list {
      display: flex;
      flex-direction: column;
      gap: 5px;
      max-height: 140px;
      overflow-y: auto;
    }
    .flow-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 4px 8px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 4px;
      font-size: 11px;
    }
    .flow-item:hover {
      background: var(--hover-bg);
      border-color: var(--accent);
    }
    .flow-left {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }
    .flow-rel-badge {
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 2px;
      background: rgba(0, 122, 204, 0.15);
      color: var(--accent);
      border: 1px solid rgba(0, 122, 204, 0.3);
      flex-shrink: 0;
      font-weight: 600;
    }
    .flow-node-name {
      font-family: var(--code-font);
      font-weight: 600;
      color: var(--fg);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .flow-file-hint {
      font-size: 10px;
      color: var(--fg-sub);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 140px;
    }
    .btn-flow-jump {
      padding: 2px 7px;
      background: transparent;
      border: 1px solid var(--card-border);
      color: var(--accent);
      border-radius: 3px;
      cursor: pointer;
      font-size: 10px;
      flex-shrink: 0;
      white-space: nowrap;
      transition: background 0.15s, color 0.15s;
    }
    .btn-flow-jump:hover {
      background: var(--accent);
      color: #fff;
    }
    .flow-divider {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--fg-sub);
      font-size: 11px;
      font-weight: 700;
      padding: 2px 0;
    }
    .flow-empty-hint {
      font-size: 11px;
      color: var(--fg-sub);
      font-style: italic;
      padding: 4px 6px;
    }

    /* AI 架构报告卡片 (完全展示，绝不锁死高度) */
    .ai-doc-card {
      background: var(--vscode-editor-background, rgba(0,0,0,0.1));
      border: 1px solid rgba(0, 122, 204, 0.35);
      border-radius: 6px;
      overflow: visible;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      word-break: break-word;
    }
    .ai-doc-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: rgba(0, 122, 204, 0.08);
      border-bottom: 1px solid rgba(0, 122, 204, 0.2);
    }
    .ai-doc-header-title {
      font-weight: 700;
      font-size: 12px;
      color: var(--accent);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ai-doc-body {
      padding: 12px 14px;
      font-size: 12px;
      line-height: 1.65;
      color: var(--fg);
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    .ai-doc-body h3 {
      font-size: 12px;
      font-weight: 700;
      margin-top: 14px;
      margin-bottom: 6px;
      color: var(--fg);
      border-bottom: 1px dashed var(--card-border);
      padding-bottom: 3px;
    }
    .ai-doc-body h3:first-child {
      margin-top: 0;
    }
    .ai-doc-body p {
      margin-bottom: 8px;
      color: var(--fg);
    }
    .ai-doc-body ul, .ai-doc-body ol {
      margin-left: 18px;
      margin-top: 4px;
      margin-bottom: 8px;
      padding-left: 0;
    }
    .ai-doc-body ol {
      list-style-type: decimal;
    }
    .ai-doc-body ul {
      list-style-type: disc;
    }
    .ai-doc-body li {
      margin-bottom: 4px;
      line-height: 1.6;
    }
    .ai-doc-body li > ul {
      margin-left: 16px;
      margin-top: 4px;
      margin-bottom: 6px;
      list-style-type: circle;
    }
    .ai-doc-body code {
      background: var(--hover-bg);
      padding: 1px 4px;
      border-radius: 3px;
      font-family: var(--code-font);
      font-size: 11px;
      border: 1px solid var(--card-border);
    }
    .ai-doc-body pre {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      padding: 8px 10px;
      border-radius: 4px;
      overflow-x: auto;
      margin-bottom: 8px;
      font-family: var(--code-font);
      font-size: 11px;
    }

    /* 批量分析进度条 */
    .batch-progress-bar {
      display: none;
      padding: 6px 12px;
      background: var(--card-bg);
      border-bottom: 1px solid var(--card-border);
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
      z-index: 15;
    }
    .batch-progress-bar.active { display: flex; }
    .batch-progress-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: var(--fg-sub);
    }
    .batch-progress-track {
      width: 100%;
      height: 4px;
      background: var(--card-border);
      border-radius: 2px;
      overflow: hidden;
    }
    .batch-progress-fill {
      height: 100%;
      background: var(--accent);
      width: 0%;
      transition: width 0.2s ease;
    }

    /* 独立脚本顶层执行步骤 */
    .pipeline-step-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 5px 8px;
      background: var(--vscode-editor-background, rgba(0,0,0,0.1));
      border: 1px solid var(--card-border);
      border-radius: 4px;
      font-size: 11px;
      transition: background 0.15s, border-color 0.15s;
    }
    .pipeline-step-item:hover {
      background: var(--hover-bg);
      border-color: var(--accent);
    }
    .step-badge {
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 10px;
      background: #8b5cf6;
      color: #fff;
      font-weight: 700;
      flex-shrink: 0;
    }

    /* 设置弹窗 (Settings Modal) */
    .modal-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(2px);
      z-index: 100;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 14px;
      box-sizing: border-box;
    }
    .modal-overlay.active {
      display: flex;
    }
    .modal-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      width: 100%;
      max-width: 480px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
      overflow: hidden;
    }
    .modal-header {
      padding: 10px 14px;
      border-bottom: 1px solid var(--card-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(0, 0, 0, 0.08);
    }
    .modal-title {
      font-weight: 700;
      font-size: 12px;
      color: var(--fg);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .modal-close {
      background: transparent;
      border: none;
      color: var(--fg-sub);
      font-size: 14px;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 3px;
    }
    .modal-close:hover { color: var(--fg); background: var(--hover-bg); }
    .modal-body {
      padding: 14px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .setting-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--card-border);
    }
    .setting-group:last-child { border-bottom: none; padding-bottom: 0; }
    .setting-title {
      font-weight: 600;
      font-size: 11px;
      color: var(--fg);
    }
    .setting-desc {
      font-size: 10px;
      color: var(--fg-sub);
      line-height: 1.4;
    }
    .setting-input, .setting-select {
      width: 100%;
      padding: 5px 8px;
      background: var(--vscode-input-background, #3c3c3c);
      color: var(--fg);
      border: 1px solid var(--vscode-input-border, #555);
      border-radius: 4px;
      font-size: 11px;
      outline: none;
      box-sizing: border-box;
      font-family: var(--font-family);
    }
    .setting-input:focus, .setting-select:focus { border-color: var(--accent); }
    .setting-info-box {
      background: var(--vscode-editor-background, rgba(0,0,0,0.1));
      border: 1px solid var(--card-border);
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 10px;
      color: var(--fg-sub);
      font-family: var(--code-font);
      margin-top: 4px;
    }
    .scope-options-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .scope-option-card {
      padding: 8px 12px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 5px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }
    .scope-option-card:hover {
      background: var(--hover-bg);
    }
    .scope-option-card.selected {
      border-color: var(--accent);
      background: rgba(0, 122, 204, 0.06);
    }
    .scope-radio-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .scope-option-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--fg);
      cursor: pointer;
    }
    .scope-option-desc {
      font-size: 10px;
      color: var(--fg-sub);
      margin-left: 20px;
      margin-top: 2px;
      line-height: 1.4;
    }
    .scope-select-wrapper {
      margin-left: 20px;
      margin-top: 6px;
    }
    .tree-stats {
      font-size: 10px;
      color: var(--fg-sub);
      white-space: nowrap;
      padding: 2px 6px;
      border-radius: 3px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .tree-stats:hover {
      background: var(--hover-bg);
      color: var(--accent);
    }
    .modal-footer {
      padding: 10px 14px;
      border-top: 1px solid var(--card-border);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      background: rgba(0, 0, 0, 0.05);
    }
  </style>
</head>
<body>

  <!-- 顶部主工具栏 -->
  <div class="toolbar">
    <div class="search-row">
      <input type="text" id="search-input" class="search-input" placeholder="搜索架构树/类/函数 (支持自然语言业务词)..." />
      <button class="search-clear-btn" id="btn-clear-search" style="display: none;" title="清空搜索">✕</button>
      <div class="search-results-dropdown" id="search-results-dropdown" style="display: none;"></div>
    </div>
    <div class="tab-bar">
      <div class="tab-group-left">
        <button class="tab-btn active" id="tab-tree">架构树</button>
        <button class="tab-btn" id="tab-card">详情</button>
      </div>
      <div class="tab-group-right">
        <button class="btn-icon" id="btn-batch-ai" title="运行架构分析 (可选择整工程或当前选中项)">批量分析</button>
        <button class="btn-icon" id="btn-export-md" title="导出为 Markdown 架构资产文档">导出报告</button>
        <button class="btn-icon" id="btn-open-settings" title="配置大模型与系统参数">设置</button>
      </div>
    </div>
  </div>

  <!-- 批量分析进度条 -->
  <div class="batch-progress-bar" id="batch-progress-bar">
    <div class="batch-progress-header">
      <span id="batch-progress-text">正在分析工作区架构...</span>
      <button class="btn-secondary" id="btn-batch-cancel" style="padding: 1px 6px; font-size: 9px; border-radius: 2px; cursor: pointer;">中止</button>
    </div>
    <div class="batch-progress-track">
      <div class="batch-progress-fill" id="batch-progress-fill"></div>
    </div>
  </div>

  <!-- 主体视口容器 -->
  <div class="views-viewport">

    <!-- TAB 1: 架构资产树 -->
    <div class="tab-panel active" id="panel-tree">
      <div class="tree-toolbar">
        <div class="tree-filter-pills">
          <button class="filter-pill active" data-filter="all">全部</button>
          <button class="filter-pill" data-filter="class">类</button>
          <button class="filter-pill" data-filter="function">函数</button>
          <button class="filter-pill" data-filter="dead">未引用</button>
          <button class="filter-pill" id="btn-view-project" data-filter="project">工程全景</button>
        </div>
        <div class="tree-stats" id="tree-stats-text" title="点击查看全工程架构大报告与资产定位">加载中...</div>
      </div>
      <div class="tree-container" id="tree-root"></div>
    </div>

    <!-- TAB 2: 实体与文件详情 -->
    <div class="tab-panel" id="panel-card">
      <div class="contract-body" id="card-content">
        <p style="color: var(--fg-sub); text-align: center; margin-top: 50px;">请在架构树中选择任意文件、类或函数查看详情</p>
      </div>
    </div>

  </div>

  <!-- 设置弹窗 (Settings Modal) -->
  <div class="modal-overlay" id="settings-modal">
    <div class="modal-card" style="max-width: 440px;">
      <div class="modal-header">
        <div class="modal-title">大模型与系统设置</div>
        <button class="modal-close" id="btn-close-settings">×</button>
      </div>
      <div class="modal-body">
        <div class="setting-group">
          <div class="setting-title">API 接口地址 (Base URL)</div>
          <div class="setting-desc">兼容 OpenAI 规范的 API 接口 (如 http://127.0.0.1:11434/v1 或第三方服务)</div>
          <input type="text" id="cfg-endpoint" class="setting-input" placeholder="http://127.0.0.1:11434/v1" />
        </div>

        <div class="setting-group">
          <div class="setting-title">API 密钥 (API Key)</div>
          <div class="setting-desc">接口鉴权凭证 (本地 Ollama 等无鉴权服务可留空)</div>
          <input type="password" id="cfg-apikey" class="setting-input" placeholder="sk-... (无鉴权本地服务可留空)" />
        </div>

        <div class="setting-group">
          <div class="setting-title">模型名称 (Model)</div>
          <div style="display: flex; gap: 6px;">
            <input type="text" id="cfg-model" class="setting-input" placeholder="如 qwen2.5-coder:7b / deepseek-chat / gpt-4o" style="flex: 1;" />
            <button id="btn-cfg-test-connection" class="btn-secondary" style="white-space: nowrap;">测试连接</button>
          </div>
          <div id="cfg-test-result" style="font-size: 11px; margin-top: 5px; display: none; padding: 4px 8px; border-radius: 3px;"></div>
        </div>

        <div class="setting-group" style="padding-top: 8px; border-top: 1px solid var(--card-border);">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
              <input type="checkbox" id="cfg-cache-enable" checked style="cursor: pointer;" />
              <span class="setting-title" style="margin-bottom: 0;">启用文件指纹增量缓存</span>
            </label>
            <button id="btn-clear-cache" class="btn-secondary" style="font-size: 10px; padding: 2px 8px; color: #ea580c; border-color: rgba(234, 88, 12, 0.4);">
              清空缓存
            </button>
          </div>
          <div class="setting-desc" style="margin-top: 4px;">未修改代码直接复用已有分析结果，避免重复请求消耗算力</div>
          <div class="setting-info-box" id="cfg-cache-stats" style="margin-top: 6px;">已缓存: 0 个文件 | 0 个函数摘要</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" id="btn-save-settings">保存设置</button>
        <button class="btn-secondary" id="btn-cancel-settings">取消</button>
      </div>
    </div>
  </div>

  <!-- 代码分析范围选择弹窗 -->
  <div class="modal-overlay" id="scope-modal">
    <div class="modal-card" style="max-width: 440px;">
      <div class="modal-header">
        <div class="modal-title">代码分析范围</div>
        <button class="modal-close" id="btn-close-scope">×</button>
      </div>
      <div class="modal-body" style="gap: 10px;">
        <p style="font-size: 11px; color: var(--fg-sub);">
          选择需要进行架构分析的代码范围：
        </p>
        
        <div class="scope-options-group">
          <!-- 选项 1: 全部文件 -->
          <div class="scope-option-card selected" id="opt-scope-all" data-mode="all">
            <div class="scope-radio-row">
              <input type="radio" name="scope-mode" id="radio-scope-all" value="all" checked style="cursor: pointer;" />
              <label for="radio-scope-all" class="scope-option-label">全部文件</label>
            </div>
            <div class="scope-option-desc">扫描工作区所有代码文件并汇总工程概览报告</div>
          </div>

          <!-- 选项 2: 指定目录 -->
          <div class="scope-option-card" id="opt-scope-folder" data-mode="folder">
            <div class="scope-radio-row">
              <input type="radio" name="scope-mode" id="radio-scope-folder" value="folder" style="cursor: pointer;" />
              <label for="radio-scope-folder" class="scope-option-label">指定目录</label>
            </div>
            <div class="scope-option-desc">分析选定目录下的代码文件并生成模块综述</div>
            <div class="scope-select-wrapper" id="wrap-folder-select" style="display: none;">
              <select class="form-input" id="scope-folder-select" style="font-size: 11px; padding: 4px 6px; width: 100%;"></select>
            </div>
          </div>

          <!-- 选项 3: 指定文件 -->
          <div class="scope-option-card" id="opt-scope-file" data-mode="file">
            <div class="scope-radio-row">
              <input type="radio" name="scope-mode" id="radio-scope-file" value="file" style="cursor: pointer;" />
              <label for="radio-scope-file" class="scope-option-label">指定文件</label>
            </div>
            <div class="scope-option-desc">仅对指定代码文件中的函数与类进行分析</div>
            <div class="scope-select-wrapper" id="wrap-file-select" style="display: none;">
              <select class="form-input" id="scope-file-select" style="font-size: 11px; padding: 4px 6px; width: 100%;"></select>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="btn-cancel-scope">取消</button>
        <button class="btn" id="btn-start-analysis">开始分析</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // 状态机
    let activeTab = 'tree'; // 'tree' | 'card'
    let currentTreeData = [];
    let currentEgoData = null;
    let selectedSymbol = null;
    let selectedFileNode = null;
    let selectedFolderNode = null;
    let projectSummaryText = null;
    let activeFilter = 'all';
    let currentConfig = null;
    const fileAiDocs = new Map();
    const folderAiDocs = new Map();

    // DOM 引用
    const tabTree = document.getElementById('tab-tree');
    const tabCard = document.getElementById('tab-card');
    const panelTree = document.getElementById('panel-tree');
    const panelCard = document.getElementById('panel-card');

    const searchInput = document.getElementById('search-input');
    const searchDropdown = document.getElementById('search-results-dropdown');
    const btnClearSearch = document.getElementById('btn-clear-search');
    let searchDebounceTimer = null;
    let latestSearchResults = [];
    const btnRefresh = document.getElementById('btn-refresh');
    const btnBatchAi = document.getElementById('btn-batch-ai');
    const btnExportMd = document.getElementById('btn-export-md');
    const batchProgressBar = document.getElementById('batch-progress-bar');
    const batchProgressText = document.getElementById('batch-progress-text');
    const batchProgressFill = document.getElementById('batch-progress-fill');
    const btnBatchCancel = document.getElementById('btn-batch-cancel');

    const treeRoot = document.getElementById('tree-root');
    const treeStatsText = document.getElementById('tree-stats-text');
    const cardContent = document.getElementById('card-content');

    // 范围选择弹窗引用
    const scopeModal = document.getElementById('scope-modal');
    const btnCloseScope = document.getElementById('btn-close-scope');
    const btnCancelScope = document.getElementById('btn-cancel-scope');
    const btnStartAnalysis = document.getElementById('btn-start-analysis');
    const optScopeAll = document.getElementById('opt-scope-all');
    const optScopeFolder = document.getElementById('opt-scope-folder');
    const optScopeFile = document.getElementById('opt-scope-file');
    const radioScopeAll = document.getElementById('radio-scope-all');
    const radioScopeFolder = document.getElementById('radio-scope-folder');
    const radioScopeFile = document.getElementById('radio-scope-file');
    const wrapFolderSelect = document.getElementById('wrap-folder-select');
    const wrapFileSelect = document.getElementById('wrap-file-select');
    const scopeFolderSelect = document.getElementById('scope-folder-select');
    const scopeFileSelect = document.getElementById('scope-file-select');
    let currentScopeMode = 'all'; // 'all' | 'folder' | 'file'

    // 设置弹窗引用
    const btnOpenSettings = document.getElementById('btn-open-settings');
    const settingsModal = document.getElementById('settings-modal');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const btnCancelSettings = document.getElementById('btn-cancel-settings');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    const btnClearCache = document.getElementById('btn-clear-cache');

    const cfgEndpoint = document.getElementById('cfg-endpoint');
    const cfgApiKey = document.getElementById('cfg-apikey');
    const cfgModel = document.getElementById('cfg-model');
    const btnCfgTestConnection = document.getElementById('btn-cfg-test-connection');
    const cfgTestResult = document.getElementById('cfg-test-result');
    const cfgCacheEnable = document.getElementById('cfg-cache-enable');
    const cfgCacheStats = document.getElementById('cfg-cache-stats');

    // 选项卡切换
    function switchTab(tab) {
      activeTab = tab;
      [tabTree, tabCard].forEach(b => b.classList.remove('active'));
      [panelTree, panelCard].forEach(p => p.classList.remove('active'));

      if (tab === 'tree') {
        tabTree.classList.add('active');
        panelTree.classList.add('active');
      } else if (tab === 'card') {
        tabCard.classList.add('active');
        panelCard.classList.add('active');
        if (selectedFolderNode) {
          renderFolderCard(selectedFolderNode);
        } else if (selectedFileNode) {
          renderFileCard(selectedFileNode);
        } else if (selectedSymbol) {
          renderContractCard(selectedSymbol);
        } else {
          renderProjectCard();
        }
      }
    }

    tabTree.onclick = () => switchTab('tree');
    tabCard.onclick = () => switchTab('card');

    // 筛选 Pill 切换
    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.onclick = () => {
        const filter = btn.getAttribute('data-filter') || 'all';
        if (filter === 'project') {
          switchTab('card');
          renderProjectCard();
          return;
        }
        document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = filter;
        renderHierarchyTree(currentTreeData);
      };
    });

    if (treeStatsText) {
      treeStatsText.onclick = () => {
        switchTab('card');
        renderProjectCard();
      };
    }

    // 批量分析范围弹窗控制与联动
    function setScopeMode(mode) {
      currentScopeMode = mode;
      [optScopeAll, optScopeFolder, optScopeFile].forEach(opt => {
        if (opt) opt.classList.remove('selected');
      });
      if (wrapFolderSelect) wrapFolderSelect.style.display = mode === 'folder' ? 'block' : 'none';
      if (wrapFileSelect) wrapFileSelect.style.display = mode === 'file' ? 'block' : 'none';

      if (mode === 'all') {
        if (optScopeAll) optScopeAll.classList.add('selected');
        if (radioScopeAll) radioScopeAll.checked = true;
      } else if (mode === 'folder') {
        if (optScopeFolder) optScopeFolder.classList.add('selected');
        if (radioScopeFolder) radioScopeFolder.checked = true;
      } else if (mode === 'file') {
        if (optScopeFile) optScopeFile.classList.add('selected');
        if (radioScopeFile) radioScopeFile.checked = true;
      }
    }

    if (optScopeAll) optScopeAll.onclick = () => setScopeMode('all');
    if (optScopeFolder) optScopeFolder.onclick = (e) => {
      if (e.target !== scopeFolderSelect) setScopeMode('folder');
    };
    if (optScopeFile) optScopeFile.onclick = (e) => {
      if (e.target !== scopeFileSelect) setScopeMode('file');
    };
    if (radioScopeAll) radioScopeAll.onchange = () => setScopeMode('all');
    if (radioScopeFolder) radioScopeFolder.onchange = () => setScopeMode('folder');
    if (radioScopeFile) radioScopeFile.onchange = () => setScopeMode('file');

    function populateScopeSelectors() {
      if (!scopeFolderSelect || !scopeFileSelect) return;
      const folders = [];
      const files = [];

      function walk(nodes) {
        if (!nodes || !nodes.length) return;
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          if (n.kind === 'folder') {
            folders.push({ name: n.name, path: n.filePath });
            if (n.children) walk(n.children);
          } else if (n.kind === 'file') {
            files.push({ name: n.name, path: n.filePath });
          }
        }
      }
      walk(currentTreeData);

      scopeFolderSelect.innerHTML = folders.map(f => '<option value="' + escapeHtml(f.path) + '">' + escapeHtml(f.path) + '</option>').join('');
      scopeFileSelect.innerHTML = files.map(f => '<option value="' + escapeHtml(f.path) + '">' + escapeHtml(f.path) + '</option>').join('');

      if (selectedFolderNode) {
        setScopeMode('folder');
        scopeFolderSelect.value = selectedFolderNode.filePath;
      } else if (selectedFileNode) {
        setScopeMode('file');
        scopeFileSelect.value = selectedFileNode.filePath;
      } else {
        setScopeMode('all');
      }
    }

    if (btnBatchAi) {
      btnBatchAi.onclick = () => {
        populateScopeSelectors();
        if (scopeModal) scopeModal.classList.add('active');
      };
    }

    if (btnStartAnalysis) {
      btnStartAnalysis.onclick = () => {
        if (scopeModal) scopeModal.classList.remove('active');
        if (currentScopeMode === 'all') {
          vscode.postMessage({ type: 'START_WORKSPACE_ANALYSIS', scope: { mode: 'all' } });
        } else if (currentScopeMode === 'folder') {
          const target = scopeFolderSelect ? scopeFolderSelect.value : '';
          vscode.postMessage({ type: 'START_WORKSPACE_ANALYSIS', scope: { mode: 'folder', targetPath: target } });
        } else if (currentScopeMode === 'file') {
          const target = scopeFileSelect ? scopeFileSelect.value : '';
          vscode.postMessage({ type: 'START_WORKSPACE_ANALYSIS', scope: { mode: 'file', targetPath: target } });
        }
      };
    }

    if (btnCloseScope && scopeModal) {
      btnCloseScope.onclick = () => scopeModal.classList.remove('active');
    }
    if (btnCancelScope && scopeModal) {
      btnCancelScope.onclick = () => scopeModal.classList.remove('active');
    }
    if (btnBatchCancel) {
      btnBatchCancel.onclick = () => {
        vscode.postMessage({ type: 'CANCEL_WORKSPACE_ANALYSIS' });
      };
    }

    // 设置弹窗事件绑定
    if (btnOpenSettings && settingsModal) {
      btnOpenSettings.onclick = () => {
        settingsModal.classList.add('active');
        if (cfgTestResult) cfgTestResult.style.display = 'none';
      };
    }
    if (btnCloseSettings && settingsModal) {
      btnCloseSettings.onclick = () => settingsModal.classList.remove('active');
    }
    if (btnCancelSettings && settingsModal) {
      btnCancelSettings.onclick = () => settingsModal.classList.remove('active');
    }
    if (btnCfgTestConnection) {
      btnCfgTestConnection.onclick = () => {
        btnCfgTestConnection.textContent = '测试中...';
        btnCfgTestConnection.disabled = true;
        if (cfgTestResult) {
          cfgTestResult.style.display = 'block';
          cfgTestResult.style.color = 'var(--fg-sub)';
          cfgTestResult.style.background = 'var(--card-bg)';
          cfgTestResult.style.border = '1px solid var(--card-border)';
          cfgTestResult.textContent = '正在发起测试连接...';
        }
        vscode.postMessage({
          type: 'TEST_CONNECTION',
          config: {
            endpoint: cfgEndpoint ? cfgEndpoint.value.trim() : '',
            apiKey: cfgApiKey ? cfgApiKey.value.trim() : '',
            selectedModel: cfgModel ? cfgModel.value.trim() : '',
          }
        });
      };
    }
    if (btnSaveSettings) {
      btnSaveSettings.onclick = () => {
        vscode.postMessage({
          type: 'SAVE_CONFIG',
          config: {
            endpoint: cfgEndpoint ? cfgEndpoint.value.trim() : 'http://127.0.0.1:11434/v1',
            apiKey: cfgApiKey ? cfgApiKey.value.trim() : '',
            selectedModel: cfgModel ? cfgModel.value.trim() : '',
            enableIncrementalCache: cfgCacheEnable ? cfgCacheEnable.checked : true,
          }
        });
        if (settingsModal) settingsModal.classList.remove('active');
      };
    }
    if (btnClearCache) {
      btnClearCache.onclick = () => {
        vscode.postMessage({ type: 'CLEAR_CACHE' });
      };
    }
    if (btnExportMd) {
      btnExportMd.onclick = () => {
        vscode.postMessage({ type: 'EXPORT_MARKDOWN_DOC' });
      };
    }

    // ========================================================
    // 渲染架构树 (Hierarchy Tree View)
    // ========================================================
    function renderHierarchyTree(nodes) {
      currentTreeData = nodes || [];
      treeRoot.innerHTML = '';

      if (!currentTreeData.length) {
        treeRoot.innerHTML = '<div style="color: var(--fg-sub); text-align: center; padding: 24px;">工作区暂无 Python 资产</div>';
        treeStatsText.textContent = '0 类 | 0 函数 | 0 未引用';
        return;
      }

      let totalClasses = 0;
      let totalFunctions = 0;
      let deadCount = 0;
      for (const node of currentTreeData) {
        totalClasses += node.stats.totalClasses;
        totalFunctions += node.stats.totalFunctions;
        deadCount += node.stats.deadCodeCount;
      }
      treeStatsText.textContent = \`\${totalClasses} 类 | \${totalFunctions} 函数 | \${deadCount} 未引用\`;

      const filterText = searchInput.value.trim().toLowerCase();

      function filterNode(node) {
        if (activeFilter === 'class' && node.kind !== 'class' && node.kind !== 'folder' && node.kind !== 'file') return false;
        if (activeFilter === 'function' && (node.kind === 'class') && (!node.children || node.children.length === 0)) return false;
        if (activeFilter === 'dead') {
          if (node.kind === 'folder' || node.kind === 'file') {
            if (node.stats.deadCodeCount === 0) return false;
          } else if (!node.isDeadCodeCandidate) {
            return false;
          }
        }

        if (!filterText) return true;
        if (node.name.toLowerCase().includes(filterText)) return true;
        if (node.children && node.children.some(filterNode)) return true;
        return false;
      }

      function createTreeDOM(node, level = 0) {
        if (!filterNode(node)) return null;

        const wrapper = document.createElement('div');
        const row = document.createElement('div');
        row.className = 'tree-node-row';
        if (selectedSymbol && node.symbolId === selectedSymbol.id) {
          row.classList.add('selected');
        } else if (selectedFileNode && node.kind === 'file' && node.filePath === selectedFileNode.filePath) {
          row.classList.add('selected');
        } else if (selectedFolderNode && node.kind === 'folder' && node.filePath === selectedFolderNode.filePath) {
          row.classList.add('selected');
        }

        // 折叠箭头
        const chevron = document.createElement('span');
        chevron.className = 'tree-chevron';
        const hasChildren = node.children && node.children.length > 0;
        if (hasChildren) {
          chevron.textContent = '▶';
          chevron.classList.add('expanded');
        } else {
          chevron.classList.add('leaf');
        }
        row.appendChild(chevron);

        // 类型标签
        const tag = document.createElement('span');
        tag.className = 'tree-tag';
        if (node.kind === 'folder') {
          tag.classList.add('tree-tag-folder');
          tag.textContent = '目录';
        } else if (node.kind === 'file') {
          if (node.isScriptEntry) {
            tag.classList.add('tree-tag-script');
            tag.textContent = '脚本';
          } else {
            tag.classList.add('tree-tag-file');
            tag.textContent = '文件';
          }
        } else if (node.kind === 'class') {
          tag.classList.add('tree-tag-class');
          tag.textContent = '类';
        } else if (node.kind === 'method') {
          tag.classList.add('tree-tag-method');
          tag.textContent = '方法';
        } else {
          tag.classList.add('tree-tag-func');
          tag.textContent = '函数';
        }
        row.appendChild(tag);

        // 实体名称
        const label = document.createElement('span');
        label.className = 'tree-label';
        label.textContent = node.name;
        row.appendChild(label);

        // 统计角标
        if (node.kind === 'folder' || node.kind === 'file') {
          const badge = document.createElement('span');
          badge.className = 'tree-badge';
          badge.textContent = \`\${node.stats.totalClasses}C \${node.stats.totalFunctions}F\`;
          row.appendChild(badge);
        }

        // 脚本标记
        if (node.kind === 'file' && node.isScriptEntry) {
          const scriptBadge = document.createElement('span');
          scriptBadge.className = 'tree-badge';
          scriptBadge.style.color = '#8b5cf6';
          scriptBadge.style.borderColor = '#8b5cf6';
          scriptBadge.textContent = '脚本入口';
          row.appendChild(scriptBadge);
        }

        // 未引用标记
        if (node.isDeadCodeCandidate) {
          const deadTag = document.createElement('span');
          deadTag.className = 'tree-dead-tag';
          deadTag.textContent = '未引用';
          row.appendChild(deadTag);
        }

        wrapper.appendChild(row);

        // 子树容器
        let childrenContainer = null;
        if (hasChildren) {
          childrenContainer = document.createElement('div');
          childrenContainer.className = 'tree-children';
          for (const child of node.children) {
            const childDOM = createTreeDOM(child, level + 1);
            if (childDOM) childrenContainer.appendChild(childDOM);
          }
          wrapper.appendChild(childrenContainer);

          chevron.onclick = (e) => {
            e.stopPropagation();
            const isExpanded = chevron.classList.toggle('expanded');
            childrenContainer.classList.toggle('collapsed', !isExpanded);
          };
        }

        // 单击：选中并进入详情
        row.onclick = () => {
          document.querySelectorAll('.tree-node-row').forEach(r => r.classList.remove('selected'));
          row.classList.add('selected');

          if (node.kind === 'folder') {
            selectedFolderNode = node;
            selectedFileNode = null;
            selectedSymbol = null;
            switchTab('card');
            renderFolderCard(node);
          } else if (node.kind === 'file') {
            selectedFileNode = node;
            selectedFolderNode = null;
            selectedSymbol = null;
            switchTab('card');
            renderFileCard(node);
          } else if (node.symbolId) {
            selectedSymbol = node;
            selectedFolderNode = null;
            selectedFileNode = null;
            switchTab('card');
            vscode.postMessage({ type: 'FOCUS_NODE', symbolId: node.symbolId });
          }
        };

        // 双击：跳转源码位置或折叠目录
        row.ondblclick = () => {
          if (node.kind === 'folder') {
            if (chevron && hasChildren) chevron.click();
          } else if (node.kind === 'file') {
            vscode.postMessage({ type: 'JUMP_TO_LOCATION', filePath: node.filePath, line: 1, column: 1 });
          } else if (node.symbolId) {
            vscode.postMessage({ type: 'JUMP_TO_CODE', symbolId: node.symbolId });
          }
        };

        return wrapper;
      }

      for (const rootNode of currentTreeData) {
        const dom = createTreeDOM(rootNode, 0);
        if (dom) treeRoot.appendChild(dom);
      }
    }

    // ========================================================
    // Markdown 解析引擎 (支持代码块、标题、列表、粗体、行内代码)
    // ========================================================
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function formatInline(text) {
      var t = escapeHtml(text);
      t = t.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
      var bt = String.fromCharCode(96);
      var codePattern = new RegExp(bt + '([^' + bt + ']+)' + bt, 'g');
      t = t.replace(codePattern, '<code>$1</code>');
      return t;
    }

    function renderMarkdown(md) {
      if (!md) return '';
      let clean = String(md).trim();
      var bt = String.fromCharCode(96);
      var bt3 = bt + bt + bt;
      var fencePattern = new RegExp('^' + bt3 + '(?:markdown)?\\s*\\n?([\\s\\S]*?)\\n?' + bt3 + '$', 'i');
      clean = clean.replace(fencePattern, '$1').trim();

      const lines = clean.split(/\\r?\\n/);
      let html = '';
      let inTopUl = false;
      let inOl = false;
      let inLi = false;
      let inNestedUl = false;
      let inCodeBlock = false;
      let codeBlockContent = '';

      function closeAllLists() {
        if (inNestedUl) { html += '</ul>'; inNestedUl = false; }
        if (inLi) { html += '</li>'; inLi = false; }
        if (inOl) { html += '</ol>'; inOl = false; }
        if (inTopUl) { html += '</ul>'; inTopUl = false; }
      }

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // 1. 代码块
        if (trimmed.indexOf(bt3) === 0) {
          if (inCodeBlock) {
            html += '<pre><code>' + escapeHtml(codeBlockContent.trim()) + '</code></pre>';
            codeBlockContent = '';
            inCodeBlock = false;
          } else {
            closeAllLists();
            inCodeBlock = true;
          }
          continue;
        }

        if (inCodeBlock) {
          codeBlockContent += line + String.fromCharCode(10);
          continue;
        }

        // 2. 空行：在列表内部遇到空行不立即关闭有序/嵌套列表，保持松散列表连续性
        if (!trimmed) {
          continue;
        }

        // 3. 分割线 (--- / ***)
        if (/^[-*_]{3,}$/.test(trimmed)) {
          closeAllLists();
          html += '<hr style="border:0; border-top:1px dashed var(--card-border); margin:12px 0;" />';
          continue;
        }

        // 4. Setext 式下划线标题 (如下一行是 --- 或 ===)
        if (i + 1 < lines.length && /^[=-]{3,}$/.test(lines[i + 1].trim())) {
          closeAllLists();
          html += '<h3>' + formatInline(trimmed) + '</h3>';
          i++;
          continue;
        }

        // 5. ATX 标题 (###, ##, #)
        if (trimmed.startsWith('#')) {
          closeAllLists();
          const title = trimmed.replace(/^#+\\s*/, '');
          html += '<h3>' + formatInline(title) + '</h3>';
          continue;
        }

        // 6. 有序列表项 (如: 1. loadSnapshot 方法: 或 2. saveSnapshot 方法:)
        const olMatch = trimmed.match(/^(\\d+)\\.\\s+(.*)$/);
        if (olMatch) {
          if (inTopUl) { html += '</ul>'; inTopUl = false; }
          if (inNestedUl) { html += '</ul>'; inNestedUl = false; }
          if (inLi) { html += '</li>'; inLi = false; }

          if (!inOl) {
            html += '<ol>';
            inOl = true;
          }
          html += '<li>' + formatInline(olMatch[2]);
          inLi = true;
          continue;
        }

        // 7. 无序列表项 (如: - 无参数 或 * 参数约束)
        const ulMatch = trimmed.match(/^[-*•]\\s+(.*)$/);
        if (ulMatch) {
          const itemText = ulMatch[1];
          // 如果当前正处于有序列表项内，作为该项的缩进子列表
          if (inOl && inLi) {
            if (!inNestedUl) {
              html += '<ul>';
              inNestedUl = true;
            }
            html += '<li>' + formatInline(itemText) + '</li>';
          } else {
            if (inOl) {
              if (inLi) { html += '</li>'; inLi = false; }
              html += '</ol>';
              inOl = false;
            }
            if (!inTopUl) {
              html += '<ul>';
              inTopUl = true;
            }
            html += '<li>' + formatInline(itemText) + '</li>';
          }
          continue;
        }

        // 8. 普通段落
        closeAllLists();
        html += '<p>' + formatInline(trimmed) + '</p>';
      }

      closeAllLists();
      if (inCodeBlock) {
        html += '<pre><code>' + escapeHtml(codeBlockContent.trim()) + '</code></pre>';
      }
      return html;
    }

    // ========================================================
    // TAB 2: 函数/类实体契约详情卡片渲染 (Contract Inspector)
    // ========================================================
    function renderContractCard(symbol) {
      if (!symbol) return;
      selectedSymbol = symbol;
      selectedFileNode = null;

      const kindClass = symbol.kind === 'class' ? 'badge-class' : (symbol.kind === 'method' ? 'badge-method' : 'badge-func');
      const kindLabel = symbol.kind === 'class' ? '类' : (symbol.kind === 'method' ? '方法' : '函数');
      const usageList = symbol.usages || [];
      const usageCount = symbol.usageCount !== undefined ? symbol.usageCount : usageList.length;

      // 顶部引用状态标识
      const isDead = symbol.isDeadCodeCandidate;
      let usageBadge = '';
      if (usageCount > 0) {
        usageBadge = '<span class="badge badge-usage">' + usageCount + ' 处代码调用</span>';
      } else if (isDead) {
        usageBadge = '<span class="badge badge-orphan">0 处引用 · 孤立候选</span>';
      } else {
        usageBadge = '<span class="badge">出口 / 根实体</span>';
      }

      // 1. 代码引用与调用位置板块 (Usages & References)
      let usagesHtml = '';
      if (usageList.length > 0) {
        usagesHtml = \`
          <div>
            <div class="section-title" style="display: flex; justify-content: space-between; align-items: center;">
              <span>代码调用与引用位置 (Usages & References)</span>
              <span class="badge badge-usage">共 \${usageCount} 处</span>
            </div>
            <div class="usage-list">
              \${usageList.map(u => {
                const shortFile = (u.filePath || '').split('/').pop() || u.filePath;
                return \`
                  <div class="usage-item">
                    <div class="usage-left">
                      <span class="\${u.isTopLevelScript ? 'usage-pill-toplevel' : 'usage-pill-fn'}">
                        \${u.isTopLevelScript ? '顶层脚本' : '函数调用'}
                      </span>
                      <span class="usage-caller" title="\${escapeHtml(u.callerSymbolId)}">\${escapeHtml(u.callerName)}</span>
                      \${u.callSnippet ? \`<span class="usage-snippet"><code>\${escapeHtml(u.callSnippet)}</code></span>\` : ''}
                    </div>
                    <div class="usage-link" data-path="\${escapeHtml(u.filePath)}" data-line="\${u.line}" data-col="\${u.column || 1}" title="点击跳转至该调用位置">
                      \${escapeHtml(shortFile)}:L\${u.line} ↗
                    </div>
                  </div>
                \`;
              }).join('')}
            </div>
          </div>
        \`;
      } else {
        usagesHtml = \`
          <div>
            <div class="section-title">代码调用与引用位置 (Usages & References)</div>
            <div class="usage-empty-box">
              <span class="badge badge-orphan">暂无代码调用</span>
              <p style="margin-top: 5px; font-size: 11px; color: var(--fg-sub); line-height: 1.4;">
                在当前工作区代码中未检索到直接调用点。若该实体是对外 API、测试入口或动态调用，属于正常架构设计。
              </p>
            </div>
          </div>
        \`;
      }

      // 2. 调用流转与依赖关系板块 (Call Flow & Dependencies)
      let flowHtml = '';
      const ego = (currentEgoData && currentEgoData.center && currentEgoData.center.id === symbol.id) ? currentEgoData : null;
      if (ego) {
        const preds = ego.predecessors || [];
        const succs = ego.successors || [];

        let predsHtml = '';
        if (preds.length > 0) {
          predsHtml = preds.map(p => {
            const relKind = p.edge.kind === 'calls' ? '调用' : (p.edge.kind === 'contains' ? '所属类' : (p.edge.kind === 'inherits' ? '子类' : '实例化'));
            const pKind = p.node.kind === 'class' ? '类' : (p.node.kind === 'method' ? '方法' : '函数');
            return \`
              <div class="flow-item">
                <div class="flow-left">
                  <span class="flow-rel-badge">\${relKind}</span>
                  <span class="tree-tag tree-tag-\${p.node.kind === 'class' ? 'class' : 'func'}">\${pKind}</span>
                  <span class="flow-node-name" title="\${escapeHtml(p.node.name)}">\${escapeHtml(p.node.name)}</span>
                  <span class="flow-file-hint">\${escapeHtml(p.node.filePath)}</span>
                </div>
                <button class="btn-flow-jump" data-symid="\${escapeHtml(p.node.id)}">查看 -></button>
              </div>
            \`;
          }).join('');
        } else {
          predsHtml = '<div class="flow-empty-hint">暂无上游调用者 (可能是工作区顶层入口或对外接口)</div>';
        }

        let succsHtml = '';
        if (succs.length > 0) {
          succsHtml = succs.map(s => {
            const relKind = s.edge.kind === 'calls' ? '调用' : (s.edge.kind === 'contains' ? '包含成员' : (s.edge.kind === 'inherits' ? '基类' : '实例化'));
            const sKind = s.node.kind === 'class' ? '类' : (s.node.kind === 'method' ? '方法' : '函数');
            return \`
              <div class="flow-item">
                <div class="flow-left">
                  <span class="flow-rel-badge">\${relKind}</span>
                  <span class="tree-tag tree-tag-\${s.node.kind === 'class' ? 'class' : 'func'}">\${sKind}</span>
                  <span class="flow-node-name" title="\${escapeHtml(s.node.name)}">\${escapeHtml(s.node.name)}</span>
                  <span class="flow-file-hint">\${escapeHtml(s.node.filePath)}</span>
                </div>
                <button class="btn-flow-jump" data-symid="\${escapeHtml(s.node.id)}">查看 -></button>
              </div>
            \`;
          }).join('');
        } else {
          succsHtml = '<div class="flow-empty-hint">暂无下游依赖 (叶子节点，未调用系统内其他函数)</div>';
        }

        flowHtml = \`
          <div>
            <div class="section-title">架构调用流转与依赖关系 (Call Flow & Dependencies)</div>
            <div class="flow-container">
              <div>
                <div class="flow-section-title">上游来源 (\${preds.length})</div>
                <div class="flow-list">\${predsHtml}</div>
              </div>
              <div>
                <div class="flow-section-title">下游依赖 (\${succs.length})</div>
                <div class="flow-list">\${succsHtml}</div>
              </div>
            </div>
          </div>
        \`;
      }

      // 3. AI 报告 / Docstring 板块
      let aiDocHtml = '';
      if (symbol.docstring?.isAiGenerated) {
        aiDocHtml = \`
          <div class="ai-doc-card">
            <div class="ai-doc-header">
              <div class="ai-doc-header-title">
                <span>AI 报告</span>
              </div>
              <button class="btn-secondary" id="btn-regen-ai" style="padding: 2px 8px; font-size: 10px;">
                重新分析
              </button>
            </div>
            <div class="ai-doc-body">
              \${renderMarkdown(symbol.docstring.summary)}
            </div>
          </div>
        \`;
      } else if (symbol.docstring?.summary) {
        aiDocHtml = \`
          <div>
            <div class="section-title">源码说明 (Docstring)</div>
            <div class="doc-box">
              <div class="doc-summary">\${escapeHtml(symbol.docstring.summary)}</div>
              \${symbol.docstring.description ? \`<div class="doc-desc">\${escapeHtml(symbol.docstring.description)}</div>\` : ''}
            </div>
          </div>
          <button class="btn btn-secondary" id="btn-gen-ai-doc" style="width: 100%; font-size: 11px;">
            生成 AI 报告
          </button>
        \`;
      } else {
        aiDocHtml = \`
          <div>
            <div class="section-title">源码说明 (Docstring)</div>
            <div class="doc-box" style="opacity: 0.7; font-style: italic;">
              暂无源码注释文档
            </div>
          </div>
          <button class="btn btn-secondary" id="btn-gen-ai-doc" style="width: 100%; font-size: 11px;">
            生成 AI 报告
          </button>
        \`;
      }

      // 4. 形参契约 (Parameters)
      let paramsHtml = '';
      if (symbol.parameters && symbol.parameters.length > 0) {
        paramsHtml = \`
          <div>
            <div class="section-title">形参契约 (Parameters)</div>
            <table class="param-table">
              <thead><tr><th>参数名</th><th>类型</th><th>默认值</th></tr></thead>
              <tbody>
                \${symbol.parameters.map(p => \`
                  <tr>
                    <td><strong>\${escapeHtml(p.name)}</strong></td>
                    <td class="param-type">\${escapeHtml(p.typeHint || 'Any')}</td>
                    <td class="param-default">\${escapeHtml(p.defaultValue || '-')}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
      }

      // 5. 继承基类 (Inherits)
      let basesHtml = '';
      if (symbol.bases && symbol.bases.length > 0) {
        basesHtml = \`
          <div>
            <div class="section-title">继承基类 (Inherits)</div>
            <div style="font-family: var(--code-font); font-size: 11px; display: flex; gap: 4px; flex-wrap: wrap;">
              \${symbol.bases.map(b => \`<span class="badge badge-class">\${escapeHtml(b)}</span>\`).join('')}
            </div>
          </div>
        \`;
      }

      // 组装最终卡片 DOM
      cardContent.innerHTML = \`
        <div style="background: var(--card-bg); padding: 12px; border-radius: 6px; border: 1px solid var(--card-border);">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="badge \${kindClass}">\${kindLabel}</span>
              \${usageBadge}
            </div>
          </div>
          <div class="symbol-name-banner" style="margin-top: 8px;">\${escapeHtml(symbol.name)}</div>
          <div class="code-location" id="link-code" style="margin-top: 6px; display: inline-flex; align-items: center; gap: 4px;">
            <span>\${escapeHtml(symbol.filePath)} : 第 \${symbol.range.startLine} 行</span>
            <span>↗</span>
          </div>
        </div>

        \${usagesHtml}
        \${flowHtml}
        \${aiDocHtml}
        \${basesHtml}
        \${paramsHtml}

        \${symbol.returnType ? \`
          <div>
            <div class="section-title">出参类型 (Return Type)</div>
            <span class="badge badge-func" style="font-family: var(--code-font); font-size: 11px;">
              \${escapeHtml(symbol.returnType)}
            </span>
          </div>
        \` : ''}
      \`;

      // 交互事件绑定
      document.getElementById('link-code').onclick = () => {
        vscode.postMessage({ type: 'JUMP_TO_CODE', symbolId: symbol.id });
      };

      document.querySelectorAll('.usage-link').forEach(elem => {
        elem.onclick = (e) => {
          e.stopPropagation();
          const targetPath = elem.getAttribute('data-path');
          const line = parseInt(elem.getAttribute('data-line') || '1', 10);
          const col = parseInt(elem.getAttribute('data-col') || '1', 10);
          if (targetPath) {
            vscode.postMessage({
              type: 'JUMP_TO_LOCATION',
              filePath: targetPath,
              line: line,
              column: col
            });
          }
        };
      });

      document.querySelectorAll('.btn-flow-jump').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const targetSymId = btn.getAttribute('data-symid');
          if (targetSymId) {
            vscode.postMessage({ type: 'FOCUS_NODE', symbolId: targetSymId });
          }
        };
      });

      const btnGenAi = document.getElementById('btn-gen-ai-doc');
      if (btnGenAi) {
        btnGenAi.onclick = () => {
          btnGenAi.textContent = '⏳ AI 分析生成中...';
          btnGenAi.disabled = true;
          vscode.postMessage({ type: 'GENERATE_AI_DOC', symbolId: symbol.id });
        };
      }

      const btnRegenAi = document.getElementById('btn-regen-ai');
      if (btnRegenAi) {
        btnRegenAi.onclick = () => {
          btnRegenAi.textContent = '⏳ 分析中...';
          btnRegenAi.disabled = true;
          vscode.postMessage({ type: 'GENERATE_AI_DOC', symbolId: symbol.id });
        };
      }
    }

    // ========================================================
    // 文件级架构卡片渲染 (File Architecture Details)
    // ========================================================
    function renderFileCard(fileNode) {
      if (!fileNode) return;
      selectedFileNode = fileNode;
      selectedSymbol = null;

      const fileName = fileNode.name;
      const filePath = fileNode.filePath;
      const stats = fileNode.stats || { totalClasses: 0, totalFunctions: 0, deadCodeCount: 0 };
      const isScript = !!fileNode.isScriptEntry;
      const pipeline = fileNode.scriptPipeline || [];

      // 1. 顶部 Header
      let badgeHtml = isScript
        ? '<span class="badge" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6; border: 1px solid rgba(139, 92, 246, 0.4);">独立脚本入口</span>'
        : '<span class="badge badge-class">代码文件</span>';

      let statsBadge = '<span class="badge" style="background: var(--hover-bg); border: 1px solid var(--card-border); color: var(--fg-sub);">' + stats.totalClasses + ' 个类 | ' + stats.totalFunctions + ' 个函数</span>';

      // 2. 独立脚本顶层执行管道流 (Pipeline Execution Flow)
      let pipelineHtml = '';
      if (pipeline.length > 0) {
        pipelineHtml = \`
          <div>
            <div class="section-title" style="display: flex; justify-content: space-between; align-items: center;">
              <span>顶层脚本执行管道 (Script Pipeline)</span>
              <span class="badge" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6; border: 1px solid rgba(139, 92, 246, 0.3);">共 \${pipeline.length} 步</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; max-height: 240px; overflow-y: auto;">
              \${pipeline.map(step => {
                return \`
                  <div class="pipeline-step-item">
                    <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">
                      <span class="step-badge">#\${step.step}</span>
                      <span style="font-family: var(--code-font); font-weight: 600; color: var(--fg);">\${escapeHtml(step.calleeName)}</span>
                      \${step.callSnippet ? \`<span class="usage-snippet"><code>\${escapeHtml(step.callSnippet)}</code></span>\` : ''}
                    </div>
                    <div class="usage-link" data-path="\${escapeHtml(filePath)}" data-line="\${step.line}" title="跳转至该执行语句">
                      L\${step.line} ↗
                    </div>
                  </div>
                \`;
              }).join('')}
            </div>
          </div>
        \`;
      }

      // 3. AI 报告
      const cachedSummary = fileAiDocs.get(filePath);
      let aiDocHtml = '';
      if (cachedSummary) {
        aiDocHtml = \`
          <div class="ai-doc-card">
            <div class="ai-doc-header">
              <div class="ai-doc-header-title">
                <span>文件架构概览 (AI 报告)</span>
              </div>
              <button class="btn-secondary" id="btn-regen-file-ai" style="padding: 2px 8px; font-size: 10px;" title="单次请求：仅重新生成本文件宏观架构定位报告">
                重新生成
              </button>
            </div>
            <div class="ai-doc-body">
              \${renderMarkdown(cachedSummary)}
            </div>
          </div>
        \`;
      } else {
        aiDocHtml = \`
          <div>
            <div class="section-title">文件架构概览 (AI 报告)</div>
            <div class="usage-empty-box" style="text-align: center; padding: 14px;">
              <p style="color: var(--fg-sub); font-size: 11px; margin-bottom: 10px;">
                暂无当前文件的 AI 架构概览，可一键推导职责定位、执行管道与依赖拓扑
              </p>
              <button class="btn" id="btn-gen-file-ai" style="font-size: 11px;" title="单次请求：仅宏观分析当前文件职责边界与对外导出，不逐个推导内部函数">
                生成文件概览报告
              </button>
            </div>
          </div>
        \`;
      }

      // 4. 包含的符号列表
      let entitiesHtml = '';
      if (fileNode.children && fileNode.children.length > 0) {
        entitiesHtml = \`
          <div>
            <div class="section-title">模块包含的实体定义 (Classes & Functions)</div>
            <div style="display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto;">
              \${fileNode.children.map(child => {
                const childTag = child.kind === 'class' ? '类' : '函数';
                return \`
                  <div class="usage-item" style="cursor: pointer;" data-symid="\${escapeHtml(child.symbolId || '')}">
                    <div class="usage-left">
                      <span class="tree-tag tree-tag-\${child.kind === 'class' ? 'class' : 'func'}">\${childTag}</span>
                      <span class="usage-caller">\${escapeHtml(child.name)}</span>
                      \${child.returnType ? \`<span class="badge badge-func" style="font-size: 9px; padding: 1px 4px;">\${escapeHtml(child.returnType)}</span>\` : ''}
                      \${child.isDeadCodeCandidate ? '<span class="tree-dead-tag">未引用</span>' : ''}
                    </div>
                    <span style="color: var(--accent); font-size: 10px;">查看 -></span>
                  </div>
                \`;
              }).join('')}
            </div>
          </div>
        \`;
      }

      // 组装最终卡片 DOM
      cardContent.innerHTML = \`
        <div style="background: var(--card-bg); padding: 12px; border-radius: 6px; border: 1px solid var(--card-border);">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              \${badgeHtml}
              \${statsBadge}
            </div>
          </div>
          <div class="symbol-name-banner" style="margin-top: 8px;">\${escapeHtml(fileName)}</div>
          <div class="code-location" id="link-file-code" style="margin-top: 6px; display: inline-flex; align-items: center; gap: 4px;">
            <span>\${escapeHtml(filePath)}</span>
            <span>↗</span>
          </div>
          <div style="display: flex; gap: 6px; margin-top: 10px;">
            <button class="btn-secondary" id="btn-batch-this-file" style="font-size: 11px;" title="全量微批扫描：遍历推导本文件内全部函数与方法的业务契约并写入缓存">深度分析文件内全部函数</button>
          </div>
        </div>

        \${pipelineHtml}
        \${aiDocHtml}
        \${entitiesHtml}
      \`;

      // 事件绑定
      document.getElementById('link-file-code').onclick = () => {
        vscode.postMessage({ type: 'JUMP_TO_LOCATION', filePath: filePath, line: 1, column: 1 });
      };

      const btnBatchFile = document.getElementById('btn-batch-this-file');
      if (btnBatchFile) {
        btnBatchFile.onclick = () => {
          vscode.postMessage({ type: 'START_WORKSPACE_ANALYSIS', scope: { mode: 'file', targetPath: filePath } });
        };
      }

      document.querySelectorAll('#card-content .usage-link').forEach(elem => {
        elem.onclick = (e) => {
          e.stopPropagation();
          const targetPath = elem.getAttribute('data-path');
          const line = parseInt(elem.getAttribute('data-line') || '1', 10);
          if (targetPath) {
            vscode.postMessage({
              type: 'JUMP_TO_LOCATION',
              filePath: targetPath,
              line: line,
              column: 1
            });
          }
        };
      });

      document.querySelectorAll('#card-content .usage-item[data-symid]').forEach(elem => {
        elem.onclick = () => {
          const symId = elem.getAttribute('data-symid');
          if (symId) {
            vscode.postMessage({ type: 'FOCUS_NODE', symbolId: symId });
          }
        };
      });

      const btnGen = document.getElementById('btn-gen-file-ai');
      if (btnGen) {
        btnGen.onclick = () => {
          btnGen.textContent = '⏳ AI 正在分析文件架构...';
          btnGen.disabled = true;
          vscode.postMessage({ type: 'GENERATE_FILE_AI_DOC', filePath: filePath });
        };
      }

      const btnRegen = document.getElementById('btn-regen-file-ai');
      if (btnRegen) {
        btnRegen.onclick = () => {
          btnRegen.textContent = '⏳ 分析中...';
          btnRegen.disabled = true;
          vscode.postMessage({ type: 'GENERATE_FILE_AI_DOC', filePath: filePath });
        };
      }
    }

    // ========================================================
    // 目录模块级架构卡片渲染 (Folder / Module Architecture Details)
    // ========================================================
    function renderFolderCard(folderNode) {
      if (!folderNode) return;
      selectedFolderNode = folderNode;
      selectedFileNode = null;
      selectedSymbol = null;

      const folderName = folderNode.name;
      const folderPath = folderNode.filePath;
      const stats = folderNode.stats || { totalClasses: 0, totalFunctions: 0, deadCodeCount: 0 };

      const cachedSummary = folderAiDocs.get(folderPath);
      let aiDocHtml = '';
      if (cachedSummary) {
        aiDocHtml = \`
          <div class="ai-doc-card">
            <div class="ai-doc-header">
              <div class="ai-doc-header-title">
                <span>AI 模块领域综述</span>
              </div>
              <button class="btn-secondary" id="btn-regen-folder-ai" style="padding: 2px 8px; font-size: 10px;">
                重新分析
              </button>
            </div>
            <div class="ai-doc-body">
              \${renderMarkdown(cachedSummary)}
            </div>
          </div>
        \`;
      } else {
        aiDocHtml = \`
          <div>
            <div class="section-title">模块领域综述与协作模式</div>
            <div class="usage-empty-box" style="text-align: center; padding: 14px;">
              <p style="color: var(--fg-sub); font-size: 11px; margin-bottom: 10px;">
                暂无当前目录的 AI 领域架构综述，可一键推导职责边界、协同模式与核心对外能力
              </p>
              <button class="btn" id="btn-gen-folder-ai" style="font-size: 11px;">
                生成模块领域架构综述
              </button>
            </div>
          </div>
        \`;
      }

      const children = folderNode.children || [];
      let childrenHtml = '';
      if (children.length > 0) {
        childrenHtml = \`
          <div>
            <div class="section-title">模块包含的子项 (\${children.length})</div>
            <div style="display: flex; flex-direction: column; gap: 4px; max-height: 240px; overflow-y: auto;">
              \${children.map(child => {
                const isFld = child.kind === 'folder';
                const tagClass = isFld ? 'tree-tag-folder' : (child.isScriptEntry ? 'tree-tag-script' : 'tree-tag-file');
                const tagLabel = isFld ? '目录' : (child.isScriptEntry ? '脚本' : '文件');
                const summaryPreview = isFld ? (folderAiDocs.get(child.filePath) || '') : (fileAiDocs.get(child.filePath) || '');
                const brief = summaryPreview ? summaryPreview.slice(0, 50).replace(/\\r?\\n/g, ' ') + '...' : '';

                return \`
                  <div class="usage-item" style="cursor: pointer;" data-kind="\${child.kind}" data-path="\${escapeHtml(child.filePath)}">
                    <div class="usage-left">
                      <span class="tree-tag \${tagClass}">\${tagLabel}</span>
                      <span class="usage-caller">\${escapeHtml(child.name)}</span>
                      <span class="tree-badge">\${child.stats.totalClasses}C \${child.stats.totalFunctions}F</span>
                      \${brief ? \`<span class="usage-snippet" style="max-width: 130px;">\${escapeHtml(brief)}</span>\` : ''}
                    </div>
                    <span style="color: var(--accent); font-size: 10px;">查看 -></span>
                  </div>
                \`;
              }).join('')}
            </div>
          </div>
        \`;
      }

      cardContent.innerHTML = \`
        <div style="background: var(--card-bg); padding: 12px; border-radius: 6px; border: 1px solid var(--card-border);">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
            <span class="badge" style="background: rgba(0, 122, 204, 0.15); color: var(--accent); border: 1px solid rgba(0, 122, 204, 0.4);">业务模块目录</span>
            <span class="badge" style="background: var(--hover-bg); border: 1px solid var(--card-border); color: var(--fg-sub);">
              \${stats.totalClasses} 个类 | \${stats.totalFunctions} 个函数
            </span>
          </div>
          <div class="symbol-name-banner" style="margin-top: 8px;">\${escapeHtml(folderName)}</div>
          <div class="code-location" style="margin-top: 6px;">
            <span>\${escapeHtml(folderPath || '工程根目录')}</span>
          </div>
          <div style="display: flex; gap: 6px; margin-top: 10px;">
            <button class="btn" id="btn-batch-this-folder" style="font-size: 11px;">分析此目录</button>
          </div>
        </div>

        \${aiDocHtml}
        \${childrenHtml}
      \`;

      const btnGenFolder = document.getElementById('btn-gen-folder-ai');
      if (btnGenFolder) {
        btnGenFolder.onclick = () => {
          btnGenFolder.textContent = '⏳ 正在推导模块领域架构综述...';
          btnGenFolder.disabled = true;
          vscode.postMessage({ type: 'GENERATE_FOLDER_AI_DOC', folderPath: folderPath });
        };
      }
      const btnRegenFolder = document.getElementById('btn-regen-folder-ai');
      if (btnRegenFolder) {
        btnRegenFolder.onclick = () => {
          btnRegenFolder.textContent = '⏳ 分析中...';
          btnRegenFolder.disabled = true;
          vscode.postMessage({ type: 'GENERATE_FOLDER_AI_DOC', folderPath: folderPath });
        };
      }
      const btnBatchFolder = document.getElementById('btn-batch-this-folder');
      if (btnBatchFolder) {
        btnBatchFolder.onclick = () => {
          vscode.postMessage({ type: 'START_WORKSPACE_ANALYSIS', scope: { mode: 'folder', targetPath: folderPath } });
        };
      }

      document.querySelectorAll('#card-content .usage-item[data-path]').forEach(elem => {
        elem.onclick = () => {
          const p = elem.getAttribute('data-path');
          const k = elem.getAttribute('data-kind');
          function findNode(nodes) {
            for (const n of nodes) {
              if (n.kind === k && n.filePath === p) return n;
              if (n.children) {
                const found = findNode(n.children);
                if (found) return found;
              }
            }
            return null;
          }
          const targetNode = findNode(currentTreeData);
          if (targetNode) {
            if (targetNode.kind === 'file') {
              renderFileCard(targetNode);
            } else if (targetNode.kind === 'folder') {
              renderFolderCard(targetNode);
            }
          }
        };
      });
    }

    // ========================================================
    // 全工程资产与大报告卡片渲染 (Project Architecture Panorama)
    // ========================================================
    function renderProjectCard() {
      selectedSymbol = null;
      selectedFileNode = null;
      selectedFolderNode = null;

      let totalClasses = 0;
      let totalFunctions = 0;
      let deadCount = 0;
      let totalFiles = 0;

      function countStats(node) {
        if (node.kind === 'file') totalFiles++;
        if (node.children) {
          for (const child of node.children) countStats(child);
        }
      }
      for (const rootNode of currentTreeData) {
        totalClasses += rootNode.stats.totalClasses;
        totalFunctions += rootNode.stats.totalFunctions;
        deadCount += rootNode.stats.deadCodeCount;
        countStats(rootNode);
      }

      const scriptEntries = [];
      const topFolders = [];
      for (const rootNode of currentTreeData) {
        if (rootNode.kind === 'folder') {
          topFolders.push(rootNode);
        } else if (rootNode.kind === 'file' && rootNode.isScriptEntry) {
          scriptEntries.push(rootNode);
        }
      }

      let aiDocHtml = '';
      if (projectSummaryText) {
        aiDocHtml = \`
          <div class="ai-doc-card">
            <div class="ai-doc-header">
              <div class="ai-doc-header-title">
                <span>AI 全工程架构全景大报告</span>
              </div>
              <button class="btn-secondary" id="btn-regen-project-ai" style="padding: 2px 8px; font-size: 10px;">
                重新分析
              </button>
            </div>
            <div class="ai-doc-body">
              \${renderMarkdown(projectSummaryText)}
            </div>
          </div>
        \`;
      } else {
        aiDocHtml = \`
          <div>
            <div class="section-title">全工程架构全景大报告</div>
            <div class="usage-empty-box" style="text-align: center; padding: 16px;">
              <p style="color: var(--fg-sub); font-size: 11px; margin-bottom: 10px;">
                暂无全工程架构资产综述。可运行批量分析自底向上推导，或点击下方立即生成。
              </p>
              <button class="btn" id="btn-gen-project-ai" style="font-size: 11px;">
                生成工程全景大报告
              </button>
            </div>
          </div>
        \`;
      }

      let entriesHtml = '';
      if (scriptEntries.length > 0) {
        entriesHtml = \`
          <div>
            <div class="section-title">系统核心入口与可执行脚本 (\${scriptEntries.length})</div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              \${scriptEntries.map(s => \`
                <div class="usage-item" style="cursor: pointer;" data-filepath="\${escapeHtml(s.filePath)}">
                  <div class="usage-left">
                    <span class="tree-tag tree-tag-script">脚本</span>
                    <span class="usage-caller">\${escapeHtml(s.name)}</span>
                  </div>
                  <span style="color: var(--accent); font-size: 10px;">查看文件 -></span>
                </div>
              \`).join('')}
            </div>
          </div>
        \`;
      }

      let foldersHtml = '';
      if (topFolders.length > 0) {
        foldersHtml = \`
          <div>
            <div class="section-title">工程业务模块划分 (\${topFolders.length} 个目录)</div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              \${topFolders.map(f => {
                const fSum = folderAiDocs.get(f.filePath);
                const brief = fSum ? fSum.slice(0, 60).replace(/\\r?\\n/g, ' ') + '...' : '暂无专属综述';
                return \`
                  <div class="usage-item" style="cursor: pointer;" data-folderpath="\${escapeHtml(f.filePath)}">
                    <div class="usage-left">
                      <span class="tree-tag tree-tag-folder">目录</span>
                      <span class="usage-caller">\${escapeHtml(f.name)}</span>
                      <span class="tree-badge">\${f.stats.totalClasses}C \${f.stats.totalFunctions}F</span>
                      \${brief ? \`<span class="usage-snippet" style="max-width: 130px;">\${escapeHtml(brief)}</span>\` : ''}
                    </div>
                    <span style="color: var(--accent); font-size: 10px;">查看模块 -></span>
                  </div>
                \`;
              }).join('')}
            </div>
          </div>
        \`;
      }

      cardContent.innerHTML = \`
        <div style="background: var(--card-bg); padding: 12px; border-radius: 6px; border: 1px solid var(--card-border);">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
            <span class="badge" style="background: rgba(0, 122, 204, 0.15); color: var(--accent); border: 1px solid rgba(0, 122, 204, 0.4);">全工程架构资产</span>
            <span class="badge" style="background: var(--hover-bg); border: 1px solid var(--card-border); color: var(--fg-sub);">
              \${totalFiles} 个文件 | \${totalClasses} 类 | \${totalFunctions} 函数
            </span>
          </div>
          <div class="symbol-name-banner" style="margin-top: 8px;">工程全景概览</div>
          <div style="display: flex; gap: 6px; margin-top: 10px;">
            <button class="btn" id="btn-proj-batch-all" style="font-size: 11px;">批量分析整工程</button>
            <button class="btn-secondary" id="btn-proj-export-md" style="font-size: 11px;">导出 Markdown 大报告</button>
          </div>
        </div>

        \${aiDocHtml}
        \${entriesHtml}
        \${foldersHtml}
      \`;

      const btnGenProj = document.getElementById('btn-gen-project-ai');
      if (btnGenProj) {
        btnGenProj.onclick = () => {
          btnGenProj.textContent = '⏳ 正在生成全工程架构全景大报告...';
          btnGenProj.disabled = true;
          vscode.postMessage({ type: 'GENERATE_PROJECT_AI_DOC' });
        };
      }
      const btnRegenProj = document.getElementById('btn-regen-project-ai');
      if (btnRegenProj) {
        btnRegenProj.onclick = () => {
          btnRegenProj.textContent = '⏳ 分析中...';
          btnRegenProj.disabled = true;
          vscode.postMessage({ type: 'GENERATE_PROJECT_AI_DOC' });
        };
      }
      const btnProjBatch = document.getElementById('btn-proj-batch-all');
      if (btnProjBatch) {
        btnProjBatch.onclick = () => {
          vscode.postMessage({ type: 'START_WORKSPACE_ANALYSIS', scope: { mode: 'all' } });
        };
      }
      const btnProjExport = document.getElementById('btn-proj-export-md');
      if (btnProjExport) {
        btnProjExport.onclick = () => {
          vscode.postMessage({ type: 'EXPORT_MARKDOWN_DOC' });
        };
      }

      document.querySelectorAll('#card-content .usage-item[data-filepath]').forEach(elem => {
        elem.onclick = () => {
          const fp = elem.getAttribute('data-filepath');
          function findFileNode(nodes) {
            for (const n of nodes) {
              if (n.kind === 'file' && n.filePath === fp) return n;
              if (n.children) {
                const found = findFileNode(n.children);
                if (found) return found;
              }
            }
            return null;
          }
          const fileNode = findFileNode(currentTreeData);
          if (fileNode) {
            renderFileCard(fileNode);
          }
        };
      });

      document.querySelectorAll('#card-content .usage-item[data-folderpath]').forEach(elem => {
        elem.onclick = () => {
          const fld = elem.getAttribute('data-folderpath');
          function findFolderNode(nodes) {
            for (const n of nodes) {
              if (n.kind === 'folder' && n.filePath === fld) return n;
              if (n.children) {
                const found = findFolderNode(n.children);
                if (found) return found;
              }
            }
            return null;
          }
          const folderNode = findFolderNode(currentTreeData);
          if (folderNode) {
            renderFolderCard(folderNode);
          }
        };
      });
    }

    // ========================================================
    // 智能搜索候选浮层控制与交互 (Top N Candidates)
    // ========================================================
    function hideSearchResults() {
      if (searchDropdown) {
        searchDropdown.style.display = 'none';
        searchDropdown.innerHTML = '';
      }
    }

    function selectSearchResult(item) {
      if (!item) return;
      vscode.postMessage({ type: 'FOCUS_NODE', symbolId: item.id });
      switchTab('card');
      hideSearchResults();
    }

    function renderSearchResults(query, results) {
      if (!searchDropdown) return;
      latestSearchResults = results || [];

      if (!query || !query.trim()) {
        hideSearchResults();
        return;
      }

      searchDropdown.innerHTML = '';
      searchDropdown.style.display = 'flex';

      const header = document.createElement('div');
      header.className = 'search-results-header';
      header.innerHTML = [
        '<span>🎯 搜索候选 (共 ', results.length, ' 个相关符号)</span>',
        '<span class="search-results-close" title="关闭 (Esc)">✕</span>'
      ].join('');
      const closeBtn = header.querySelector('.search-results-close');
      if (closeBtn) closeBtn.onclick = hideSearchResults;
      searchDropdown.appendChild(header);

      if (results.length === 0) {
        const empty = document.createElement('div');
        empty.style.padding = '14px 10px';
        empty.style.textAlign = 'center';
        empty.style.color = 'var(--fg-sub)';
        empty.style.fontSize = '11px';
        empty.innerHTML = '未找到与 "<b>' + escapeHtml(query) + '</b>" 相关的符号<br><span style="font-size:10px; color:var(--fg-sub); margin-top:4px; display:inline-block;">支持自然语言业务词（如“用户验证”）、类型特征（如 in:User）或类名/函数名</span>';
        searchDropdown.appendChild(empty);
        return;
      }

      const list = document.createElement('div');
      list.className = 'search-results-list';

      results.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'search-result-item';

        const kindClass = item.kind === 'class' ? 'tree-tag-class' : (item.kind === 'method' ? 'tree-tag-method' : 'tree-tag-func');
        const kindLabel = item.kind === 'class' ? '类' : (item.kind === 'method' ? '方法' : '函数');

        const shortFile = (item.filePath || '').split('/').pop() || item.filePath;
        const deadBadge = item.isDeadCodeCandidate ? '<span class="tree-dead-tag">未引用</span>' : '';
        const sigHtml = item.signature ? '<div class="search-result-sig"><code>' + escapeHtml(item.signature) + '</code></div>' : '';
        const summaryHtml = item.summary ? '<div class="search-result-summary">' + escapeHtml(item.summary) + '</div>' : '';

        row.innerHTML = [
          '<div class="search-result-top">',
            '<div class="search-result-name-group">',
              '<span class="tree-tag ', kindClass, '">', kindLabel, '</span>',
              '<span class="search-result-name" title="', escapeHtml(item.id), '">', escapeHtml(item.name), '</span>',
              deadBadge,
            '</div>',
            '<span class="search-result-score">相关度 ', Math.min(100, Math.round(item.score)), '</span>',
          '</div>',
          '<div class="search-result-meta">',
            '<span class="search-result-path" title="', escapeHtml(item.filePath), ':', item.line, '">', escapeHtml(shortFile), ':', item.line, '</span>',
            '<span class="search-result-reason" title="', escapeHtml(item.matchedReason), '">', escapeHtml(item.matchedReason), '</span>',
          '</div>',
          sigHtml,
          summaryHtml
        ].join('');

        row.onclick = () => {
          selectSearchResult(item);
        };

        row.ondblclick = (e) => {
          e.stopPropagation();
          vscode.postMessage({ type: 'JUMP_TO_LOCATION', filePath: item.filePath, line: item.line, column: 1 });
          hideSearchResults();
        };

        list.appendChild(row);
      });

      searchDropdown.appendChild(list);
    }

    // 搜索输入过滤与防抖触发
    searchInput.oninput = (e) => {
      const q = e.target.value.trim();
      if (btnClearSearch) {
        btnClearSearch.style.display = q ? 'block' : 'none';
      }
      renderHierarchyTree(currentTreeData);

      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      if (q) {
        searchDebounceTimer = setTimeout(() => {
          vscode.postMessage({ type: 'SEARCH', query: q });
        }, 120);
      } else {
        hideSearchResults();
      }
    };

    if (btnClearSearch) {
      btnClearSearch.onclick = () => {
        searchInput.value = '';
        btnClearSearch.style.display = 'none';
        hideSearchResults();
        renderHierarchyTree(currentTreeData);
        searchInput.focus();
      };
    }

    searchInput.onkeydown = (e) => {
      if (e.key === 'Escape') {
        hideSearchResults();
      } else if (e.key === 'Enter') {
        if (latestSearchResults && latestSearchResults.length > 0) {
          selectSearchResult(latestSearchResults[0]);
        }
      }
    };

    document.addEventListener('click', (e) => {
      if (searchDropdown && searchDropdown.style.display !== 'none') {
        if (!searchDropdown.contains(e.target) && e.target !== searchInput && e.target !== btnClearSearch) {
          hideSearchResults();
        }
      }
    });

    if (btnRefresh) {
      btnRefresh.onclick = () => {
        vscode.postMessage({ type: 'REQUEST_REFRESH' });
      };
    }

    // 接收 Extension Host 消息
    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'SET_SEARCH_RESULTS':
          renderSearchResults(msg.query, msg.results);
          break;
        case 'SET_HIERARCHY_TREE':
          renderHierarchyTree(msg.tree);
          break;
        case 'SET_EGO_GRAPH':
          currentEgoData = msg.data;
          selectedSymbol = msg.data.center;
          selectedFileNode = null;
          selectedFolderNode = null;
          switchTab('card');
          renderContractCard(msg.data.center);
          break;
        case 'SET_CONFIG': {
          currentConfig = msg.config;
          if (cfgEndpoint) cfgEndpoint.value = msg.config.endpoint || 'http://127.0.0.1:11434/v1';
          if (cfgApiKey) cfgApiKey.value = msg.config.apiKey || '';
          if (cfgModel) cfgModel.value = msg.config.selectedModel || '';
          if (cfgCacheEnable) cfgCacheEnable.checked = Boolean(msg.config.enableIncrementalCache);
          if (cfgCacheStats && msg.config.cacheStats) {
            cfgCacheStats.textContent = \`已缓存: \${msg.config.cacheStats.totalCachedFiles} 个文件 | \${msg.config.cacheStats.totalCachedSymbols} 个函数摘要\`;
          }
          break;
        }
        case 'TEST_CONNECTION_RESULT': {
          if (btnCfgTestConnection) {
            btnCfgTestConnection.textContent = '测试连接';
            btnCfgTestConnection.disabled = false;
          }
          if (cfgTestResult) {
            cfgTestResult.style.display = 'block';
            if (msg.success) {
              cfgTestResult.style.color = '#10b981';
              cfgTestResult.style.background = 'rgba(16, 185, 129, 0.1)';
              cfgTestResult.style.border = '1px solid rgba(16, 185, 129, 0.3)';
              cfgTestResult.textContent = msg.message || '连接成功！';
            } else {
              cfgTestResult.style.color = '#ef4444';
              cfgTestResult.style.background = 'rgba(239, 68, 68, 0.1)';
              cfgTestResult.style.border = '1px solid rgba(239, 68, 68, 0.3)';
              cfgTestResult.textContent = msg.message || '连接失败，请检查服务地址与密钥';
            }
          }
          break;
        }
        case 'UPDATE_PROJECT_AI_DOC': {
          projectSummaryText = msg.summary;
          if (activeTab === 'card' && !selectedSymbol && !selectedFileNode && !selectedFolderNode) {
            renderProjectCard();
          }
          break;
        }
        case 'UPDATE_FOLDER_AI_DOC': {
          folderAiDocs.set(msg.folderPath, msg.summary);
          if (activeTab === 'card' && selectedFolderNode && selectedFolderNode.filePath === msg.folderPath) {
            renderFolderCard(selectedFolderNode);
          }
          break;
        }
        case 'UPDATE_AI_DOC': {
          if (selectedSymbol && selectedSymbol.id === msg.symbolId) {
            selectedSymbol.docstring = {
              summary: msg.summary,
              isAiGenerated: true,
            };
            renderContractCard(selectedSymbol);
          }
          break;
        }
        case 'UPDATE_FILE_AI_DOC': {
          fileAiDocs.set(msg.filePath, msg.summary);
          if (selectedFileNode && selectedFileNode.filePath === msg.filePath) {
            renderFileCard(selectedFileNode);
          }
          break;
        }
        case 'SET_BATCH_PROGRESS': {
          if (msg.isRunning) {
            batchProgressBar.classList.add('active');
            batchProgressText.textContent = msg.currentItem || \`正在批量分析 (\${msg.current}/\${msg.total})\`;
            const pct = msg.total > 0 ? Math.round((msg.current / msg.total) * 100) : 0;
            batchProgressFill.style.width = pct + '%';
          } else {
            batchProgressText.textContent = msg.currentItem || '批量分析完成';
            batchProgressFill.style.width = '100%';
            setTimeout(() => {
              batchProgressBar.classList.remove('active');
            }, 2500);
          }
          break;
        }
      }
    });

    vscode.postMessage({ type: 'WEBVIEW_READY' });
  </script>
</body>
</html>`;
}
