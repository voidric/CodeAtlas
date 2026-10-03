import * as vscode from 'vscode';
import { getWebviewContent } from './uiHtml';
import { WebviewToHostMessage, HostToWebviewMessage, SymbolNode } from '../types';

export interface WebviewHostBridge {
  onWebviewReady(): void;
  onFocusNode(symbolId: string): void;
  onJumpToCode(symbolId: string): void;
  onJumpToLocation(filePath: string, line: number, column?: number): void;
  onRequestRefresh(): void;
  onRequestMacroGraph(): void;
  onRequestHierarchyTree(): void;
  onSearch(query: string): void;
  onFindPath(fromId: string, toId: string): void;
  onGenerateAiDoc(symbolId: string): void;
  onGenerateFileAiDoc(filePath: string): void;
  onGenerateFolderAiDoc(folderPath: string): void;
  onGenerateProjectAiDoc(): void;
  onStartWorkspaceAnalysis(scope?: any): void;
  onCancelWorkspaceAnalysis(): void;
  onSaveConfig(config: any): void;
  onTestConnection(config: any): void;
  onClearCache(): void;
  onExportMarkdownDoc(): void;
}

export class CodeAtlasWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'codeatlas.mainView';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _bridge: WebviewHostBridge
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    const nonce = getNonce();
    webviewView.webview.html = getWebviewContent(nonce);

    webviewView.webview.onDidReceiveMessage((message: WebviewToHostMessage) => {
      switch (message.type) {
        case 'WEBVIEW_READY':
          this._bridge.onWebviewReady();
          break;
        case 'FOCUS_NODE':
          this._bridge.onFocusNode(message.symbolId);
          break;
        case 'JUMP_TO_CODE':
          this._bridge.onJumpToCode(message.symbolId);
          break;
        case 'JUMP_TO_LOCATION':
          this._bridge.onJumpToLocation(message.filePath, message.line, message.column);
          break;
        case 'REQUEST_REFRESH':
          this._bridge.onRequestRefresh();
          break;
        case 'REQUEST_MACRO_GRAPH':
          this._bridge.onRequestMacroGraph();
          break;
        case 'REQUEST_HIERARCHY_TREE':
          this._bridge.onRequestHierarchyTree();
          break;
        case 'SEARCH':
          this._bridge.onSearch(message.query);
          break;
        case 'FIND_PATH':
          this._bridge.onFindPath(message.fromSymbolId, message.toSymbolId);
          break;
        case 'GENERATE_AI_DOC':
          this._bridge.onGenerateAiDoc(message.symbolId);
          break;
        case 'GENERATE_FILE_AI_DOC':
          this._bridge.onGenerateFileAiDoc(message.filePath);
          break;
        case 'GENERATE_FOLDER_AI_DOC':
          this._bridge.onGenerateFolderAiDoc(message.folderPath);
          break;
        case 'GENERATE_PROJECT_AI_DOC':
          this._bridge.onGenerateProjectAiDoc();
          break;
        case 'START_WORKSPACE_ANALYSIS':
          this._bridge.onStartWorkspaceAnalysis(message.scope);
          break;
        case 'CANCEL_WORKSPACE_ANALYSIS':
          this._bridge.onCancelWorkspaceAnalysis();
          break;
        case 'SAVE_CONFIG':
          this._bridge.onSaveConfig(message.config);
          break;
        case 'TEST_CONNECTION':
          this._bridge.onTestConnection(message.config);
          break;
        case 'CLEAR_CACHE':
          this._bridge.onClearCache();
          break;
        case 'EXPORT_MARKDOWN_DOC':
          this._bridge.onExportMarkdownDoc();
          break;
      }
    });
  }

  public postMessage(message: HostToWebviewMessage) {
    this._view?.webview.postMessage(message);
  }

  public isVisible(): boolean {
    return this._view?.visible ?? false;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
