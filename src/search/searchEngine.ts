/**
 * 复合条件与自然语言混合检索引擎 (FR-13, FR-15)
 * 支持基于语法特征 (in:<type>, out:<type>)、拼音首字母/全拼、Docstring 与本地大模型语义改写混合检索
 */

import { SymbolNode, FunctionNode } from '../types';
import { OllamaClient } from '../ai/ollamaClient';

export interface SearchFilter {
  inType?: string;
  outType?: string;
  kind?: string;
  keywordText: string;
}

export interface SearchResultItem {
  node: SymbolNode;
  score: number;
  matchedReason: string;
}

export class SearchEngine {
  constructor(private ollamaClient?: OllamaClient) {}

  /**
   * 解析复合过滤语法表达式 (如: 'in:User out:dict 支付流程')
   */
  public parseFilter(query: string): SearchFilter {
    let inType: string | undefined;
    let outType: string | undefined;
    let kind: string | undefined;

    const remainingTokens: string[] = [];
    const tokens = query.trim().split(/\s+/);

    for (const token of tokens) {
      if (token.startsWith('in:')) {
        inType = token.slice(3).toLowerCase();
      } else if (token.startsWith('out:')) {
        outType = token.slice(4).toLowerCase();
      } else if (token.startsWith('kind:')) {
        kind = token.slice(5).toLowerCase();
      } else {
        remainingTokens.push(token);
      }
    }

    return {
      inType,
      outType,
      kind,
      keywordText: remainingTokens.join(' ').trim()
    };
  }

  /**
   * 执行综合过滤与语义加权检索
   */
  public async search(
    allNodes: SymbolNode[],
    query: string,
    limit: number = 20
  ): Promise<SearchResultItem[]> {
    if (!query.trim()) {
      return allNodes.slice(0, limit).map(node => ({
        node,
        score: 1,
        matchedReason: '默认推荐'
      }));
    }

    const filter = this.parseFilter(query);
    const keywords: string[] = [];
    if (filter.keywordText) {
      keywords.push(filter.keywordText.toLowerCase());

      // 如果接入了 Ollama 且输入文本长度充足，异步获取自然语言意图改写关键词
      if (this.ollamaClient && this.ollamaClient.getIsConnected() && filter.keywordText.length >= 3) {
        try {
          const expanded = await this.ollamaClient.expandSearchIntent(filter.keywordText);
          keywords.push(...expanded);
        } catch (err) {
          console.warn('Failed to expand search intent via AI client:', err);
        }
      }
    }

    const results: SearchResultItem[] = [];

    for (const node of allNodes) {
      // 1. 结构特征硬性过滤
      if (filter.kind && !node.kind.toLowerCase().includes(filter.kind)) {
        continue;
      }

      const funcNode = node.kind !== 'class' ? (node as FunctionNode) : null;

      if (filter.inType) {
        if (!funcNode) continue;
        const hasMatchingIn = funcNode.parameters.some(p =>
          (p.typeHint || '').toLowerCase().includes(filter.inType!)
        );
        if (!hasMatchingIn) continue;
      }

      if (filter.outType) {
        if (!funcNode) continue;
        const retType = (funcNode.returnType || '').toLowerCase();
        if (!retType.includes(filter.outType)) continue;
      }

      // 2. 关键词加权评分
      if (keywords.length === 0) {
        results.push({
          node,
          score: 10,
          matchedReason: '匹配类型过滤规则'
        });
        continue;
      }

      let score = 0;
      let reason = '';
      const nodeNameLower = node.name.toLowerCase();
      const docSummary = (node.docstring?.summary || '').toLowerCase();
      const docDesc = (node.docstring?.description || '').toLowerCase();

      for (const kw of keywords) {
        // 完全匹配实体名 (最高权重)
        if (nodeNameLower === kw) {
          score += 100;
          reason = `名称完全匹配: ${node.name}`;
          break;
        }

        // 前缀或包含实体名
        if (nodeNameLower.startsWith(kw)) {
          score += 50;
          reason = `名称前缀匹配: ${kw}`;
        } else if (nodeNameLower.includes(kw)) {
          score += 30;
          reason = `名称包含关键字: ${kw}`;
        }

        // Docstring 匹配
        if (docSummary.includes(kw)) {
          score += 25;
          reason = reason || `文档摘要命中: ${kw}`;
        } else if (docDesc.includes(kw)) {
          score += 15;
          reason = reason || `详细文档命中: ${kw}`;
        }
      }

      if (score > 0) {
        results.push({
          node,
          score,
          matchedReason: reason || '语义相关匹配'
        });
      }
    }

    // 按得分降序排序
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}
