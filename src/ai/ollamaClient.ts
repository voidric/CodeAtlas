/**
 * 通用大模型客户端适配器 (兼容 OpenAI API 标准格式与本地 Ollama)
 * 支持 OpenAI、DeepSeek、Qwen、Moonshot 等任意兼容 OpenAI 规范的 API
 * 同时无缝兼容本地运行的 Ollama (http://127.0.0.1:11434/v1 或 /api/generate)
 */

export interface OllamaModelInfo {
  name: string;
  size: number;
}

export interface OllamaConfig {
  endpoint: string;          // API 基础地址 (Base URL)，默认 http://127.0.0.1:11434/v1
  apiKey?: string;           // 授权密钥 (OpenAI 规范 Bearer token，本地服务可留空)
  selectedModel?: string;    // 指定模型名称，如 deepseek-chat, gpt-4o, qwen2.5-coder:7b
  timeoutMs?: number;        // 请求超时时间 (默认 45000ms)
  numCtx?: number;           // 上下文窗口保留参数
  numPredict?: number;       // 最大预测 tokens
  microBatchSize?: number;   // 批处理大小
}

function cleanMarkdown(rawText: string): string {
  let clean = (rawText || '').trim();
  clean = clean.replace(/^```(?:markdown)?\s*\n?([\s\S]*?)\n?```$/i, '$1').trim();
  clean = clean.replace(/^["'“”]+|["'“”]+$/g, '').trim();
  return clean;
}

export class OllamaClient {
  private endpoint: string;
  private apiKey: string;
  private selectedModel: string | null = null;
  private timeoutMs: number;
  private numCtx: number;
  private numPredict: number;
  private microBatchSize: number;
  private isConnected: boolean = false;
  private availableModels: string[] = [];

  constructor(config: OllamaConfig = { endpoint: 'http://127.0.0.1:11434/v1' }) {
    this.endpoint = (config.endpoint || 'http://127.0.0.1:11434/v1').replace(/\/+$/, '');
    this.apiKey = config.apiKey || '';
    this.selectedModel = config.selectedModel || null;
    this.timeoutMs = config.timeoutMs || 45000;
    this.numCtx = config.numCtx || 4096;
    this.numPredict = config.numPredict || 2048;
    this.microBatchSize = config.microBatchSize || 3;
  }

  public updateConfig(config: Partial<OllamaConfig>): void {
    if (config.endpoint !== undefined) this.endpoint = config.endpoint.replace(/\/+$/, '');
    if (config.apiKey !== undefined) this.apiKey = config.apiKey.trim();
    if (config.selectedModel !== undefined) this.selectedModel = config.selectedModel.trim() || null;
    if (config.timeoutMs) this.timeoutMs = config.timeoutMs;
    if (config.numCtx) this.numCtx = config.numCtx;
    if (config.numPredict) this.numPredict = config.numPredict;
    if (config.microBatchSize) this.microBatchSize = config.microBatchSize;
  }

  public getConfig(): {
    endpoint: string;
    apiKey: string;
    selectedModel: string | null;
    numCtx: number;
    numPredict: number;
    microBatchSize: number;
  } {
    return {
      endpoint: this.endpoint,
      apiKey: this.apiKey,
      selectedModel: this.selectedModel,
      numCtx: this.numCtx,
      numPredict: this.numPredict,
      microBatchSize: this.microBatchSize,
    };
  }

  /**
   * 底层通用大模型请求 (标准 OpenAI /v1/chat/completions，兼容本地 Ollama 回退)
   */
  public async callLlm(prompt: string, maxTokens: number = 2048): Promise<string | null> {
    const model = this.selectedModel || 'qwen2.5-coder:7b';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    // 智能 Base URL 解析
    let chatUrl = this.endpoint.endsWith('/v1') 
      ? `${this.endpoint}/chat/completions` 
      : (this.endpoint.includes('/chat/completions') ? this.endpoint : `${this.endpoint}/v1/chat/completions`);

    const controller = new AbortController();
    const timeout = Math.max(this.timeoutMs, 60000);
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const resp = await fetch(chatUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: '你是一个资深软件架构师。请直奔主题输出专业高质量的结构化 Markdown 分析报告，禁止多余客套。' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2,
          max_tokens: maxTokens,
        }),
        signal: controller.signal
      });

      if (resp.ok) {
        clearTimeout(timer);
        const data = await resp.json() as any;
        const text = data.choices?.[0]?.message?.content || '';
        return cleanMarkdown(text);
      }

      // 若为本地 11434 且 /v1 报 404，回退至原生 Ollama /api/generate
      if (resp.status === 404 && this.endpoint.includes('11434')) {
        const baseOllama = this.endpoint.replace(/\/v1$/, '');
        const fbResp = await fetch(`${baseOllama}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            prompt,
            stream: false,
            options: { temperature: 0.2 }
          }),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (fbResp.ok) {
          const fbData = await fbResp.json() as any;
          return cleanMarkdown(fbData.response || '');
        }
      }

      clearTimeout(timer);
      return null;
    } catch {
      clearTimeout(timer);
      return null;
    }
  }

  /**
   * 探测并初始化大模型服务与可用模型列表
   */
  public async init(): Promise<{ success: boolean; activeModel: string | null; allModels: string[] }> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);

      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      // 1. 优先尝试标准 OpenAI /models 接口
      const modelsUrl = this.endpoint.endsWith('/v1') ? `${this.endpoint}/models` : `${this.endpoint}/v1/models`;
      let resp = await fetch(modelsUrl, { headers, signal: controller.signal }).catch(() => null);

      if (resp && resp.ok) {
        clearTimeout(timer);
        const data = await resp.json() as any;
        const list = Array.isArray(data.data) ? data.data.map((m: any) => m.id) : [];
        if (list.length > 0) {
          this.availableModels = list;
          this.isConnected = true;
          if (!this.selectedModel || !this.availableModels.includes(this.selectedModel)) {
            this.selectedModel = this.availableModels.find(m => m.includes('qwen') || m.includes('coder') || m.includes('gpt')) || this.availableModels[0];
          }
          return { success: true, activeModel: this.selectedModel, allModels: this.availableModels };
        }
      }

      // 2. 尝试本地 Ollama 原生 /api/tags 接口
      const baseOllama = this.endpoint.replace(/\/v1$/, '');
      resp = await fetch(`${baseOllama}/api/tags`, { signal: controller.signal }).catch(() => null);
      clearTimeout(timer);

      if (resp && resp.ok) {
        const data = await resp.json() as { models?: { name: string }[] };
        this.availableModels = (data.models || []).map(m => m.name);
        this.isConnected = true;

        if (!this.selectedModel || !this.availableModels.includes(this.selectedModel)) {
          const coderModel = this.availableModels.find(m => m.includes('qwen2.5-coder'));
          const smallModel = this.availableModels.find(m => m.includes('4b') || m.includes('3b'));
          const anyQwen = this.availableModels.find(m => m.includes('qwen'));
          this.selectedModel = coderModel || smallModel || anyQwen || (this.availableModels[0] ?? null);
        }

        return { success: true, activeModel: this.selectedModel, allModels: this.availableModels };
      }

      // 3. 若均无法自动列举模型，但用户显式输入了模型名，依然判定为连通
      if (this.selectedModel) {
        this.isConnected = true;
        return { success: true, activeModel: this.selectedModel, allModels: [this.selectedModel] };
      }

      this.isConnected = false;
      return { success: false, activeModel: null, allModels: [] };
    } catch {
      this.isConnected = false;
      return { success: false, activeModel: null, allModels: [] };
    }
  }

  /**
   * 测试连接有效性
   */
  public async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const probeRes = await this.callLlm('Hello, respond with "OK" only.', 16);
      if (probeRes) {
        return { success: true, message: `连接成功！模型 [${this.selectedModel || '默认'}] 响应正常。` };
      }
      return { success: false, message: '请求未能返回内容，请核对 API 接口地址、密钥或模型名称。' };
    } catch (err: any) {
      return { success: false, message: `连接异常: ${err?.message || String(err)}` };
    }
  }

  public getActiveModel(): string | null {
    return this.selectedModel;
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public getAvailableModels(): string[] {
    return this.availableModels;
  }

  public setModel(modelName: string): void {
    this.selectedModel = modelName;
  }

  public setEndpoint(endpoint: string): void {
    this.endpoint = endpoint.replace(/\/+$/, '');
  }

  /**
   * 单个函数/类结构化契约分析
   */
  public async generateSummary(
    symbolName: string,
    kind: string,
    signature: string,
    codeSnippet: string
  ): Promise<string | null> {
    const prompt = `请对以下代码实体进行结构化工程契约分析：

【实体信息】
- 名称: ${symbolName}
- 类别: ${kind}
- 签名: ${signature}

【源码实现】:
\`\`\`
${codeSnippet.slice(0, 2500)}
\`\`\`

请严格按照以下 4 个板块输出清晰规范的 Markdown 分析报告：

### 核心功能与工作流
（深入拆解该${kind}的核心目标、计算/处理逻辑步骤）

### 入参解析与约束
（逐一分析形参含义、格式约束、默认值；无参数请注明；若包含多个方法或参数，请使用有序编号 1. 2. 3. 严格递增列出，子属性用缩进的 - 列表）

### 返回值与副作用说明
（明确说明返回值类型语义；说明是否涉及 IO、外部调用、全局变量变更等副作用；若包含多个方法，请使用有序编号 1. 2. 3. 严格递增列出）

### 典型调用场景与注意事项
（说明该实体在系统架构中被谁调用、适用于什么场景及注意事项）`;

    return this.callLlm(prompt, 2048);
  }

  /**
   * 函数级微批聚合分析
   */
  public async generateFunctionMicroBatch(
    functions: { name: string; kind: string; signature: string; codeSnippet: string }[]
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    if (!functions.length) return results;

    if (functions.length === 1) {
      const single = functions[0];
      const sum = await this.generateSummary(single.name, single.kind, single.signature, single.codeSnippet);
      if (sum) results.set(single.name, sum);
      return results;
    }

    let itemsPrompt = '';
    functions.forEach((fn, idx) => {
      itemsPrompt += `\n【实体 ${idx + 1}】\n- 名称: ${fn.name}\n- 类别: ${fn.kind}\n- 签名: ${fn.signature}\n- 源码:\n\`\`\`\n${fn.codeSnippet.slice(0, 1500)}\n\`\`\`\n`;
    });

    const prompt = `请对以下 ${functions.length} 个代码实体逐一进行结构化契约分析：

${itemsPrompt}

【输出规范】：
请依次对每个实体进行分析，每个实体起始行必须严格标记为：
=== SYMBOL: [实体名称] ===

每个实体包含 4 个板块：
### 核心功能与工作流
### 入参解析与约束
### 返回值与副作用说明
### 典型调用场景与注意事项`;

    const rawText = await this.callLlm(prompt, 3000);
    if (!rawText) return results;

    const pattern = /===\s*SYMBOL:\s*\[?([a-zA-Z0-9_\.]+)\]?\s*===/g;
    let match: RegExpExecArray | null;
    const matches: { name: string; index: number }[] = [];

    while ((match = pattern.exec(rawText)) !== null) {
      matches.push({ name: match[1], index: match.index + match[0].length });
    }

    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i++) {
        const currentMatch = matches[i];
        const nextIndex = i < matches.length - 1 ? matches[i + 1].index - matches[i + 1].name.length - 20 : rawText.length;
        let body = cleanMarkdown(rawText.slice(currentMatch.index, nextIndex));
        results.set(currentMatch.name, body);
      }
    } else {
      results.set(functions[0].name, rawText);
    }

    return results;
  }

  /**
   * 单代码文件模块架构总结
   */
  public async generateFileSummary(
    fileName: string,
    filePath: string,
    fileOverviewCode: string,
    symbolsOverview: string
  ): Promise<string | null> {
    const prompt = `请对以下代码文件进行模块架构分析：

【文件信息】
- 文件名: ${fileName}
- 相对路径: ${filePath}

【文件包含的实体概览】:
${symbolsOverview.slice(0, 1200)}

【核心源码/执行流程】:
\`\`\`
${fileOverviewCode.slice(0, 2200)}
\`\`\`

请严格按照以下 4 个板块输出清晰规范的 Markdown 分析报告：

### 模块职责与定位
（深入概括该文件在整个系统架构中的职责定位）

### 执行管道与工作流
（若为直接运行脚本梳理执行管道；若为库文件拆解核心处理流程）

### 核心实体与对外能力
（列出主要类与关键函数及其实际应用职责）

### 上下游依赖与协作关系
（说明该文件依赖了系统内哪些模块，通常被谁调用）`;

    return this.callLlm(prompt, 2048);
  }

  /**
   * 文件夹/业务模块领域综述与协作模式总结
   */
  public async generateFolderSummary(
    folderName: string,
    folderPath: string,
    filesInfo: { fileName: string; summary: string }[]
  ): Promise<string | null> {
    const fileListStr = filesInfo.map(f => {
      const brief = f.summary ? f.summary.slice(0, 150).replace(/\n/g, ' ') : '暂无详细摘要';
      return `- 文件: ${f.fileName} (核心职责: ${brief})`;
    }).join('\n');

    const prompt = `请对工程中的模块目录 [${folderName}] 进行领域架构综述与协作模式总结：

【目录信息】
- 目录名称: ${folderName}
- 相对路径: ${folderPath}
- 包含文件与职责概况:
${fileListStr}

请严格按照以下 3 个板块输出 Markdown 模块分析报告：

### 模块业务领域与职责边界
（概括该文件夹承担的核心业务领域与边界责任）

### 文件间协作与数据流转
（分析文件之间如何协同工作，核心入口是谁）

### 对外暴露的核心能力与使用规范
（说明该目录对外层模块提供了哪些核心能力与调用规范）`;

    return this.callLlm(prompt, 1800);
  }

  /**
   * 全工程架构资产全景总结
   */
  public async generateProjectSummary(
    projectName: string,
    folderSummaries: { folderName: string; summary: string }[],
    scriptEntries: string[]
  ): Promise<string | null> {
    const folderListStr = folderSummaries.map(f => {
      const brief = f.summary ? f.summary.slice(0, 200).replace(/\n/g, ' ') : '包含若干子模块';
      return `- 模块/目录: ${f.folderName}\n  ${brief}`;
    }).join('\n\n');

    const entriesStr = scriptEntries.length > 0 
      ? scriptEntries.map(e => `- ${e}`).join('\n')
      : '无显式顶层独立脚本，主要作为服务或库运行';

    const prompt = `请对整个软件工程项目 [${projectName}] 进行全局架构资产全景总结：

【项目信息】
- 项目名称: ${projectName}
- 系统入口与可执行脚本:
${entriesStr}

【核心模块/目录概览】:
${folderListStr}

请严格按照以下 4 个板块输出项目架构资产全景大报告：

### 项目核心定位与业务场景
（深入阐明整个项目是做什么的、解决什么核心痛点）

### 系统核心执行主线与数据流 (Core Pipeline)
（梳理程序从输入到输出的端到端调用主链路）

### 架构分层与模块协同机制
（总结系统的架构分层设计，各模块之间的分工与协作机制）

### 关键技术选型与架构要点
（归纳项目的关键技术特征与扩展维护要点）`;

    return this.callLlm(prompt, 2500);
  }

  /**
   * 自然语言检索意图改写与扩展
   */
  public async expandSearchIntent(userQuery: string): Promise<string[]> {
    const prompt = `用户正在代码库中搜索功能。
用户口语化查询："${userQuery}"
请预测最相关的 3~5 个函数名关键词或英文词根（用空格分隔，仅输出关键词列表）：`;

    const raw = await this.callLlm(prompt, 60);
    if (!raw) return [];
    return Array.from(new Set(raw.replace(/[,;，；\n]/g, ' ').split(/\s+/).map(w => w.trim().toLowerCase()).filter(w => w.length > 1)));
  }
}
