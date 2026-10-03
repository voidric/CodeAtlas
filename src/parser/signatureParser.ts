import { Parameter } from '../types';

/**
 * Python 函数签名与参数列表解析器
 * 支持位置参数、关键字参数、*args、**kwargs、类型注解 Type Hint、默认值 Default Value，
 * 以及显式返回类型注解与从函数体内 return 语句推导字面量类型。
 */

/**
 * 顶层按逗号分割参数字符串，自动忽略括号、括号内部与引号内部的逗号
 */
export function splitTopLevel(input: string, delimiter: string = ','): string[] {
  const parts: string[] = [];
  let current = '';
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let inQuote: string | null = null;
  let isEscaped = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuote) {
      current += char;
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === inQuote) {
        inQuote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inQuote = char;
      current += char;
      continue;
    }

    if (char === '(') parenDepth++;
    else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (char === '[') bracketDepth++;
    else if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === '{') braceDepth++;
    else if (char === '}') braceDepth = Math.max(0, braceDepth - 1);

    if (
      char === delimiter &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0
    ) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim().length > 0) {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * 拆分参数单元: name[: typeHint][ = defaultValue]
 */
function parseSingleParameter(raw: string, isKeywordOnly: boolean): Parameter | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. **kwargs
  if (trimmed.startsWith('**')) {
    const rest = trimmed.slice(2).trim();
    const [nameAndType, defaultVal] = splitTopLevel(rest, '=');
    const [name, typeHint] = splitTopLevel(nameAndType, ':');
    return {
      name: name.trim(),
      typeHint: typeHint ? typeHint.trim() : undefined,
      defaultValue: defaultVal ? defaultVal.trim() : undefined,
      kind: 'kwargs'
    };
  }

  // 2. *args
  if (trimmed.startsWith('*')) {
    const rest = trimmed.slice(1).trim();
    const [nameAndType, defaultVal] = splitTopLevel(rest, '=');
    const [name, typeHint] = splitTopLevel(nameAndType, ':');
    return {
      name: name.trim(),
      typeHint: typeHint ? typeHint.trim() : undefined,
      defaultValue: defaultVal ? defaultVal.trim() : undefined,
      kind: 'args'
    };
  }

  // 3. 常规参数 name[: typeHint][ = defaultValue]
  const [nameAndType, defaultVal] = splitTopLevel(trimmed, '=');
  const [name, typeHint] = splitTopLevel(nameAndType, ':');

  const cleanName = name.trim();
  const cleanType = typeHint ? typeHint.trim() : undefined;
  const cleanDefault = defaultVal ? defaultVal.trim() : undefined;

  // 判定 kind: 如果在 bare * 之后，或者有默认值，归为 'keyword'，否则为 'positional'
  let kind: Parameter['kind'] = 'positional';
  if (isKeywordOnly || cleanDefault !== undefined) {
    kind = 'keyword';
  }

  return {
    name: cleanName,
    typeHint: cleanType,
    defaultValue: cleanDefault,
    kind
  };
}

/**
 * 解析 Python 函数参数列表（位于 def func(...) 的括号内内容）
 *
 * @param paramStr 括号内的原始字符串，例如 "self, user_id: str, email: str, is_active: bool = True"
 */
export function parseParameters(paramStr: string): Parameter[] {
  if (!paramStr || paramStr.trim().length === 0) {
    return [];
  }

  const rawTokens = splitTopLevel(paramStr, ',');
  const parameters: Parameter[] = [];
  let isKeywordOnly = false;

  for (const rawToken of rawTokens) {
    const token = rawToken.trim();
    if (!token) continue;

    // 位置参数截断符 (Python 3.8+ positional-only delimiter)
    if (token === '/') {
      continue;
    }

    // 仅限关键字参数截断符 (Python 3 bare *)
    if (token === '*') {
      isKeywordOnly = true;
      continue;
    }

    const param = parseSingleParameter(token, isKeywordOnly);
    if (param) {
      parameters.push(param);
    }
  }

  return parameters;
}

/**
 * 从单条 return 语句表达式推导字面量类型
 */
export function inferTypeFromReturnExpression(expr: string): string | undefined {
  const trimmed = expr.trim();
  if (!trimmed || trimmed === 'None') {
    return 'None';
  }

  if (trimmed === 'True' || trimmed === 'False') {
    return 'bool';
  }

  // 字符串字面量: "...", '...', f"...", f'...'
  if (
    /^(?:f|r|u|b|rf|fr)?(?:"""[\s\S]*"""|'''[\s\S]*'''|"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')$/i.test(
      trimmed
    )
  ) {
    return 'str';
  }

  // 整数或浮点数字面量
  if (/^-?\d+$/.test(trimmed)) {
    return 'int';
  }
  if (/^-?\d*\.\d+$/.test(trimmed)) {
    return 'float';
  }

  // 列表字面量: [...] 或 list(...)
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return 'list';
  }
  if (/^list\s*\(/.test(trimmed)) {
    return 'list';
  }

  // 字典或集合字面量: {...}
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return 'dict'; // 空花括号在 Python 中为 dict

    // 检查是否包含顶层冒号 ':'
    const parts = splitTopLevel(inner, ',');
    if (parts.length > 0 && splitTopLevel(parts[0], ':').length > 1) {
      return 'dict';
    }
    return 'set';
  }
  if (/^dict\s*\(/.test(trimmed)) {
    return 'dict';
  }
  if (/^set\s*\(/.test(trimmed)) {
    return 'set';
  }

  // 元组字面量: (a, b) 或 tuple(...) 或 a, b
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return 'tuple';
    if (splitTopLevel(inner, ',').length > 1) {
      return 'tuple';
    }
  }
  if (/^tuple\s*\(/.test(trimmed)) {
    return 'tuple';
  }
  if (splitTopLevel(trimmed, ',').length > 1) {
    return 'tuple';
  }

  // 布尔逻辑表达式 (包含比较运算符或逻辑运算符，如 ==, !=, in, not in, and, or)
  if (
    /(===?|!==?|<=|>=|<|>|\bin\b|\bnot\s+in\b|\bis\b|\bis\s+not\b|\band\b|\bor\b|\bnot\b)/.test(
      trimmed
    )
  ) {
    return 'bool';
  }

  // 数学计算表达式 (包含算术运算符)
  if (/[+\-*\/%]|(\/\/)|(\*\*)/.test(trimmed)) {
    if (trimmed.includes('/') && !trimmed.includes('//')) {
      return 'float';
    }
    return 'int';
  }

  // 构造调用推导：如 User(...) -> User
  const ctorMatch = trimmed.match(/^([A-Z]\w*)\s*\(/);
  if (ctorMatch) {
    return ctorMatch[1];
  }

  return undefined;
}

/**
 * 从函数体文本中递归推导所有 return 语句的返回值类型
 * 仅分析当前函数体层级的 return 语句，忽略嵌套函数/类内部的 return
 */
export function inferReturnTypeFromBody(functionBody: string): string | undefined {
  if (!functionBody || functionBody.trim().length === 0) {
    return 'None';
  }

  const lines = functionBody.split(/\r?\n/);
  const returnTypes = new Set<string>();
  let hasReturnStatement = false;

  let nestedBlockIndent: number | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const currentIndent = line.search(/\S/);

    // 检查是否在嵌套函数或类内部
    if (nestedBlockIndent !== null) {
      if (currentIndent > nestedBlockIndent) {
        continue; // 处于嵌套块内部，跳过
      } else {
        nestedBlockIndent = null; // 退出嵌套块
      }
    }

    // 遇到嵌套函数或类定义
    if (/^(?:async\s+)?def\s+/.test(trimmed) || /^class\s+/.test(trimmed)) {
      nestedBlockIndent = currentIndent;
      continue;
    }

    // 匹配 return 语句
    const returnMatch = trimmed.match(/^return(?:\s+(.*))?$/);
    if (returnMatch) {
      hasReturnStatement = true;
      const expr = returnMatch[1] ? returnMatch[1].trim() : '';
      const inferred = inferTypeFromReturnExpression(expr);
      if (inferred) {
        returnTypes.add(inferred);
      }
    }
  }

  if (!hasReturnStatement) {
    return 'None';
  }

  if (returnTypes.size === 0) {
    return undefined;
  }

  const typesArray = Array.from(returnTypes);
  if (typesArray.length === 1) {
    return typesArray[0];
  }

  // 如果包含 None 和另一个类型 T，合并为 Optional[T]
  if (typesArray.length === 2 && typesArray.includes('None')) {
    const other = typesArray.find(t => t !== 'None')!;
    return `Optional[${other}]`;
  }

  return typesArray.join(' | ');
}

/**
 * 主入口：解析返回类型注解。
 * 优先采用显式注解 -> TypeHint，若无显式注解则从函数体内 return 语句推导字面量类型。
 *
 * @param explicitAnnotation 显式返回类型注解字符串 (例如 "-> bool" 或 "bool")
 * @param functionBody 函数体代码文本
 */
export function parseReturnType(
  explicitAnnotation?: string,
  functionBody?: string
): string | undefined {
  if (explicitAnnotation && explicitAnnotation.trim().length > 0) {
    let cleaned = explicitAnnotation.trim();
    if (cleaned.startsWith('->')) {
      cleaned = cleaned.slice(2).trim();
    }
    if (cleaned.endsWith(':')) {
      cleaned = cleaned.slice(0, -1).trim();
    }
    if (cleaned.length > 0) {
      return cleaned;
    }
  }

  if (functionBody) {
    return inferReturnTypeFromBody(functionBody);
  }

  return undefined;
}
