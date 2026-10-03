/**
 * 命名业务流管理器 (FR-08)
 * 读写工作区根目录下的 .vscode/codeatlas_flows.json 配置文件，方便团队 Git 共享
 */

import * as fs from 'fs';
import * as path from 'path';

export interface NamedFlow {
  id: string;
  name: string;
  description: string;
  entrySymbolId: string;
  nodes: string[];
  updatedAt: string;
}

export interface FlowConfigFile {
  version: string;
  flows: NamedFlow[];
}

export class FlowManager {
  private configPath: string;
  private legacyConfigPath: string;

  constructor(workspaceRoot: string) {
    this.configPath = path.join(workspaceRoot, '.vscode', 'codeatlas_flows.json');
    this.legacyConfigPath = path.join(workspaceRoot, '.vscode', 'function_flows.json');
  }

  /**
   * 读取工作区业务流配置
   */
  public loadFlows(): NamedFlow[] {
    try {
      const activePath = fs.existsSync(this.configPath)
        ? this.configPath
        : (fs.existsSync(this.legacyConfigPath) ? this.legacyConfigPath : null);

      if (!activePath) {
        return [];
      }
      const raw = fs.readFileSync(activePath, 'utf-8');
      const data = JSON.parse(raw) as FlowConfigFile;
      return data.flows || [];
    } catch {
      return [];
    }
  }

  /**
   * 保存或更新单个业务流
   */
  public saveFlow(flow: NamedFlow): void {
    const flows = this.loadFlows();
    const existingIndex = flows.findIndex(f => f.id === flow.id || f.name === flow.name);

    flow.updatedAt = new Date().toISOString();

    if (existingIndex >= 0) {
      flows[existingIndex] = flow;
    } else {
      flows.push(flow);
    }

    this.writeConfigFile(flows);
  }

  /**
   * 删除业务流
   */
  public deleteFlow(flowId: string): boolean {
    const flows = this.loadFlows();
    const filtered = flows.filter(f => f.id !== flowId);
    if (filtered.length !== flows.length) {
      this.writeConfigFile(filtered);
      return true;
    }
    return false;
  }

  private writeConfigFile(flows: NamedFlow[]): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const fileContent: FlowConfigFile = {
        version: '1.0',
        flows
      };
      fs.writeFileSync(this.configPath, JSON.stringify(fileContent, null, 2), 'utf-8');
    } catch (err) {
      console.warn('保存 codeatlas_flows.json 失败:', err);
    }
  }
}
