import { DocstringInfo } from '../types';

/**
 * 结构化 Docstring 解析器
 * 支持 PEP 257 规范、Google 风格、Sphinx/reST 风格、NumPy 风格以及紧邻单行注释提取
 */

/**
 * 清洗原始三引号字符串（遵循 PEP 257 inspect.cleandoc 缩进清洗规则）
 */
export function cleanDocstring(raw: string): string {
  if (!raw) return '';

  let text = raw.trim();
  // 去除可能的引号前缀 (r, f, b, u, rf, fr 等)
  text = text.replace(/^[rRfFbBuU]{0,2}("""|''')/, '$1');

  // 去除首尾的 """ 或 '''
  if (text.startsWith('"""') && text.endsWith('"""') && text.length >= 6) {
    text = text.slice(3, -3);
  } else if (text.startsWith("'''") && text.endsWith("'''") && text.length >= 6) {
    text = text.slice(3, -3);
  }

  const lines = text.split(/\r?\n/);
  if (lines.length <= 1) {
    return text.trim();
  }

  // 寻找第 2 行起非空行的最小缩进
  let minIndent = Infinity;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length > 0) {
      const match = line.match(/^([ \t]*)/);
      const indent = match ? match[1].length : 0;
      if (indent < minIndent) {
        minIndent = indent;
      }
    }
  }

  const cleanedLines: string[] = [lines[0].trim()];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (minIndent !== Infinity && line.length >= minIndent) {
      cleanedLines.push(line.slice(minIndent).trimEnd());
    } else {
      cleanedLines.push(line.trim());
    }
  }

  // 移除首尾空行
  while (cleanedLines.length > 0 && cleanedLines[0].trim() === '') {
    cleanedLines.shift();
  }
  while (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1].trim() === '') {
    cleanedLines.pop();
  }

  return cleanedLines.join('\n');
}

type SectionType = 'none' | 'description' | 'args' | 'returns' | 'raises' | 'other';

/**
 * 结构化解析清洗后的 Docstring 文本
 */
export function extractDocstringSections(cleaned: string): {
  summary: string;
  description?: string;
  params?: Record<string, string>;
  returns?: string;
} {
  const lines = cleaned.split('\n');
  if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')) {
    return { summary: '' };
  }

  const summary = lines[0].trim();
  const descLines: string[] = [];
  const params: Record<string, string> = {};
  let returns: string | undefined;

  let currentSection: SectionType = 'none';
  let currentParamName: string | null = null;
  const returnLines: string[] = [];

  // 判断是否为节标题
  const sectionHeaderRegex = /^(?:args|arguments|parameters|params|keyword\s+args|keyword\s+arguments|returns?|raises?|yields?|notes?|examples?)\s*:?\s*$/i;

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 跳过 NumPy 风格的下划线分隔符 (例如 ---------- 或 ========)
    if (/^[-=]{3,}$/.test(trimmed)) {
      continue;
    }

    // 检查 Sphinx 格式标签: :param [type] name: desc 或 :return: desc
    const sphinxParamMatch = trimmed.match(/^:param(?:\s+[\w.[\]]+)?\s+([a-zA-Z_]\w*)\s*:\s*(.*)$/);
    if (sphinxParamMatch) {
      currentSection = 'other';
      currentParamName = sphinxParamMatch[1];
      params[currentParamName] = sphinxParamMatch[2].trim();
      continue;
    }

    const sphinxReturnMatch = trimmed.match(/^:returns?\s*:\s*(.*)$/);
    if (sphinxReturnMatch) {
      currentSection = 'other';
      returns = sphinxReturnMatch[1].trim();
      continue;
    }

    // 检查是否为节标题
    if (sectionHeaderRegex.test(trimmed)) {
      const lower = trimmed.toLowerCase().replace(/:$/, '').trim();
      if (['args', 'arguments', 'parameters', 'params', 'keyword args', 'keyword arguments'].includes(lower)) {
        currentSection = 'args';
        currentParamName = null;
      } else if (['return', 'returns'].includes(lower)) {
        currentSection = 'returns';
        currentParamName = null;
      } else {
        currentSection = 'other';
        currentParamName = null;
      }
      continue;
    }

    // 根据当前所在节处理内容
    switch (currentSection) {
      case 'none':
        if (trimmed.length > 0) {
          descLines.push(trimmed);
        }
        break;

      case 'args': {
        // 匹配参数行: param_name [(type)]: description
        const paramLineMatch = rawLine.match(/^\s*(\*?\*?[a-zA-Z_]\w*)(?:\s*\(([^)]+)\))?\s*:\s*(.*)$/);
        if (paramLineMatch) {
          currentParamName = paramLineMatch[1];
          const typeStr = paramLineMatch[2] ? `(${paramLineMatch[2].trim()}) ` : '';
          const paramDesc = `${typeStr}${paramLineMatch[3].trim()}`.trim();
          params[currentParamName] = paramDesc;
        } else if (currentParamName && trimmed.length > 0) {
          // 参数说明续行
          params[currentParamName] = (params[currentParamName] + ' ' + trimmed).trim();
        }
        break;
      }

      case 'returns':
        if (trimmed.length > 0) {
          returnLines.push(trimmed);
        }
        break;

      default:
        // 其他小节内容（如 Raises, Notes 等）暂不作为 params / returns
        break;
    }
  }

  if (returnLines.length > 0) {
    returns = returnLines.join(' ').trim();
  }

  const description = descLines.length > 0 ? descLines.join('\n').trim() : undefined;
  const resultParams = Object.keys(params).length > 0 ? params : undefined;

  return {
    summary,
    description: description || undefined,
    params: resultParams,
    returns: returns || undefined
  };
}

/**
 * 主入口：提取并结构化解析 Docstring。
 * 若无 Docstring，自动支持提取定义上方紧邻的单行注释（# 注释）。
 *
 * @param rawDocstring 函数/类体内的原始文档字符串 (例如 """...""")
 * @param leadingComments 紧邻定义上方的单行注释数组 (例如 ["# 这是注释第一行", "# 这是详细说明"])
 */
export function parseDocstring(
  rawDocstring?: string,
  leadingComments?: string[]
): DocstringInfo | undefined {
  if (rawDocstring && rawDocstring.trim().length > 0) {
    const cleaned = cleanDocstring(rawDocstring);
    if (cleaned.length > 0) {
      const sections = extractDocstringSections(cleaned);
      if (sections.summary.length > 0) {
        return {
          summary: sections.summary,
          description: sections.description,
          params: sections.params,
          returns: sections.returns,
          isAiGenerated: false
        };
      }
    }
  }

  // 若无 Docstring，从定义上方紧邻的单行注释中提取
  if (leadingComments && leadingComments.length > 0) {
    const commentLines = leadingComments
      .map(c => c.trim().replace(/^#+\s?/, '').trim())
      .filter(c => c.length > 0);

    if (commentLines.length > 0) {
      const summary = commentLines[0];
      const description = commentLines.length > 1 ? commentLines.slice(1).join('\n') : undefined;

      return {
        summary,
        description,
        isAiGenerated: false
      };
    }
  }

  return undefined;
}
