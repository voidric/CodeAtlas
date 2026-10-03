import {
  FileParseResult,
  SymbolNode,
  FunctionNode,
  ClassNode,
  FileImport,
  CallSiteInfo,
  SourceRange
} from '../types';
import { parseDocstring } from './docstringParser';
import { parseParameters, parseReturnType, splitTopLevel } from './signatureParser';

/**
 * 纯 TypeScript 实现的高性能、容错性强的 Python AST 语法解析器
 * 零外部依赖，支持顶层函数、异步函数、类与类方法、继承关系、装饰器、导入表与调用表达式提取。
 */

interface RawStatement {
  startLine: number; // 1-based
  startCol: number;  // 1-based
  endLine: number;   // 1-based
  endCol: number;
  text: string;
  indent: number;
  leadingComments: string[];
}

/**
 * Python 关键字集合，排除作为函数调用的可能性
 */
const PYTHON_KEYWORDS = new Set([
  'if', 'elif', 'else', 'while', 'for', 'in', 'return', 'yield',
  'assert', 'except', 'with', 'def', 'class', 'lambda', 'and', 'or',
  'not', 'is', 'del', 'raise', 'try', 'finally', 'from', 'import',
  'as', 'pass', 'break', 'continue', 'global', 'nonlocal', 'async', 'await'
]);

/**
 * 将相对或绝对文件路径统一转化为以正斜杠 '/' 分割的规范路径
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * 提取文件顶部所有的 import 语句
 */
export function parseImports(statements: RawStatement[]): FileImport[] {
  const imports: FileImport[] = [];

  for (const stmt of statements) {
    const text = stmt.text.trim();

    // 1. from ... import ...
    const fromMatch = text.match(/^from\s+([.\w]+)\s+import\s+(.+)$/s);
    if (fromMatch) {
      const rawModule = fromMatch[1];
      let rawItems = fromMatch[2].trim();

      // 去除括号 (User, Order)
      if (rawItems.startsWith('(') && rawItems.endsWith(')')) {
        rawItems = rawItems.slice(1, -1).trim();
      }

      // 计算相对导入层级 (前导点个数)
      const dotMatch = rawModule.match(/^(\.+)(.*)$/);
      let isRelative = false;
      let level = 0;
      let moduleName = rawModule;

      if (dotMatch) {
        isRelative = true;
        level = dotMatch[1].length;
        moduleName = dotMatch[2] || '';
      }

      if (rawItems === '*') {
        imports.push({
          raw: stmt.text,
          moduleName: moduleName || undefined,
          isWildcard: true,
          isRelative,
          level: isRelative ? level : undefined
        });
      } else {
        const itemTokens = splitTopLevel(rawItems, ',');
        for (const item of itemTokens) {
          const itemTrimmed = item.trim();
          if (!itemTrimmed) continue;

          // 处理 alias: importedSymbol as alias
          const asMatch = itemTrimmed.match(/^([a-zA-Z_]\w*)(?:\s+as\s+([a-zA-Z_]\w*))?$/);
          if (asMatch) {
            imports.push({
              raw: stmt.text,
              moduleName: moduleName || undefined,
              importedSymbol: asMatch[1],
              alias: asMatch[2] || undefined,
              isWildcard: false,
              isRelative,
              level: isRelative ? level : undefined
            });
          }
        }
      }
      continue;
    }

    // 2. import a.b as c, d.e
    const importMatch = text.match(/^import\s+(.+)$/s);
    if (importMatch) {
      let rawItems = importMatch[1].trim();
      if (rawItems.startsWith('(') && rawItems.endsWith(')')) {
        rawItems = rawItems.slice(1, -1).trim();
      }

      const itemTokens = splitTopLevel(rawItems, ',');
      for (const item of itemTokens) {
        const itemTrimmed = item.trim();
        if (!itemTrimmed) continue;

        const asMatch = itemTrimmed.match(/^([.\w]+)(?:\s+as\s+([a-zA-Z_]\w*))?$/);
        if (asMatch) {
          imports.push({
            raw: stmt.text,
            moduleName: asMatch[1],
            alias: asMatch[2] || undefined,
            isWildcard: false,
            isRelative: false
          });
        }
      }
    }
  }

  return imports;
}

/**
 * 从函数体文本中扫描调用表达式 (Call Sites)
 */
export function extractCallSites(
  bodyText: string,
  startLine: number,
  callerSymbolId: string
): CallSiteInfo[] {
  const callSites: CallSiteInfo[] = [];
  const lines = bodyText.split(/\r?\n/);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const currentLineNum = startLine + lineIdx;

    let inSingleQuote = false;
    let inDoubleQuote = false;
    let isEscaped = false;

    for (let colIdx = 0; colIdx < line.length; colIdx++) {
      const ch = line[colIdx];

      // 处理单行注释
      if (!inSingleQuote && !inDoubleQuote && ch === '#') {
        break; // 注释后内容全部忽略
      }

      // 处理转义
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (ch === '\\') {
        isEscaped = true;
        continue;
      }

      // 处理引号
      if (ch === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
        continue;
      }
      if (ch === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }

      if (inSingleQuote || inDoubleQuote) {
        continue;
      }

      // 遇到 '('，检查左侧是否为被调用的 callee 标识符
      if (ch === '(') {
        // 向左回溯寻找 callee
        let endIdx = colIdx - 1;
        while (endIdx >= 0 && /\s/.test(line[endIdx])) {
          endIdx--;
        }

        if (endIdx < 0) continue;

        // 检查是否以标识符字符或 ')' 结尾 (处理 super().__init__)
        const lastChar = line[endIdx];
        if (/[a-zA-Z0-9_]/.test(lastChar)) {
          // 向左提取完整的属性调用链 (例如 self.process, calc.add, models.User, User)
          let startIdx = endIdx;
          while (startIdx >= 0 && /[a-zA-Z0-9_.]/.test(line[startIdx])) {
            startIdx--;
          }

          // 处理特殊的 super().__init__ 形式
          let calleeCandidate = line.slice(startIdx + 1, endIdx + 1);
          let calleeStartCol = startIdx + 2; // 1-based column

          // 如果紧挨着 super().xxx
          if (startIdx >= 8 && line.slice(startIdx - 7, startIdx + 1) === 'super().') {
            calleeCandidate = `super().${calleeCandidate}`;
            calleeStartCol = startIdx - 6;
          }

          // 排除关键字 (如 if (, while (, return (, for ( 等)
          if (!PYTHON_KEYWORDS.has(calleeCandidate)) {
            callSites.push({
              calleeName: calleeCandidate,
              line: currentLineNum,
              column: calleeStartCol,
              callerSymbolId
            });
          }
        }
      }
    }
  }

  return callSites;
}

/**
 * 提取顶层或块级语句，同时正确处理多行结构（括号换行、三引号文档字符串换行等）
 */
function tokenizeToStatements(sourceCode: string): RawStatement[] {
  const lines = sourceCode.split(/\r?\n/);
  const statements: RawStatement[] = [];

  let currentStmtLines: string[] = [];
  let stmtStartLine = 1;
  let stmtStartCol = 1;
  let stmtIndent = 0;
  let leadingComments: string[] = [];

  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let inTripleQuote: string | null = null;
  let inSingleQuote: string | null = null;
  let isEscaped = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNum = i + 1;
    const trimmed = rawLine.trim();

    // 处于非多行语句中间时，检查是否为单独的注释行
    if (
      currentStmtLines.length === 0 &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      !inTripleQuote
    ) {
      if (trimmed.startsWith('#')) {
        leadingComments.push(trimmed);
        continue;
      }
      if (trimmed === '') {
        // 空行重置暂存的前导注释
        leadingComments = [];
        continue;
      }
    }

    if (currentStmtLines.length === 0) {
      stmtStartLine = lineNum;
      const indentMatch = rawLine.match(/^([ \t]*)/);
      stmtIndent = indentMatch ? indentMatch[1].length : 0;
      stmtStartCol = stmtIndent + 1;
    }

    currentStmtLines.push(rawLine);

    // 扫描该行的符号与引号深度
    for (let c = 0; c < rawLine.length; c++) {
      const ch = rawLine[c];

      // 处理转义
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (ch === '\\') {
        isEscaped = true;
        continue;
      }

      // 处理三引号
      if (inTripleQuote) {
        if (
          rawLine.slice(c, c + 3) === inTripleQuote &&
          (c === 0 || rawLine[c - 1] !== '\\')
        ) {
          inTripleQuote = null;
          c += 2;
        }
        continue;
      }

      // 处理单引号/双引号
      if (inSingleQuote) {
        if (ch === inSingleQuote && (c === 0 || rawLine[c - 1] !== '\\')) {
          inSingleQuote = null;
        }
        continue;
      }

      // 检查三引号开头
      if (rawLine.slice(c, c + 3) === '"""' || rawLine.slice(c, c + 3) === "'''") {
        inTripleQuote = rawLine.slice(c, c + 3);
        c += 2;
        continue;
      }

      // 检查单引号/双引号开头
      if (ch === '"' || ch === "'") {
        inSingleQuote = ch;
        continue;
      }

      // 单行注释：在字符串外部遇到 '#' 则忽略本行后续所有字符
      if (ch === '#') {
        break;
      }

      // 括号层级
      if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
      else if (ch === '[') bracketDepth++;
      else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
      else if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    }

    // 检查语句是否在此行结束：
    // 当所有括号闭合、不在三引号内、且行尾没有反斜杠续行时，该逻辑行结束
    const hasBackslashContinuation = rawLine.trimEnd().endsWith('\\');
    const isBalanced =
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      !inTripleQuote &&
      !hasBackslashContinuation;

    if (isBalanced) {
      statements.push({
        startLine: stmtStartLine,
        startCol: stmtStartCol,
        endLine: lineNum,
        endCol: rawLine.length,
        text: currentStmtLines.join('\n'),
        indent: stmtIndent,
        leadingComments: [...leadingComments]
      });

      currentStmtLines = [];
      leadingComments = [];
    }
  }

  // 处理最后剩余未闭合的内容
  if (currentStmtLines.length > 0) {
    statements.push({
      startLine: stmtStartLine,
      startCol: stmtStartCol,
      endLine: lines.length,
      endCol: lines[lines.length - 1].length,
      text: currentStmtLines.join('\n'),
      indent: stmtIndent,
      leadingComments: [...leadingComments]
    });
  }

  return statements;
}

/**
 * 递归/分层解析 Python 源码实体（类、函数、方法、调用位置与文档）
 */
export function parsePythonFile(sourceCode: string, filePath: string): FileParseResult {
  const normFilePath = normalizePath(filePath);
  const statements = tokenizeToStatements(sourceCode);
  const rawLines = sourceCode.split(/\r?\n/);

  const symbols: SymbolNode[] = [];
  const callSites: CallSiteInfo[] = [];
  const scriptPipeline: import('../types').ScriptPipelineStep[] = [];
  let hasTopLevelExecution = false;
  const imports = parseImports(statements);

  // 提取模块级 __all__ 导出列表（如果有）
  let moduleAllExports: Set<string> | null = null;
  for (const stmt of statements) {
    const match = stmt.text.match(/^__all__\s*=\s*\[(.*?)\]/s);
    if (match) {
      const items = splitTopLevel(match[1], ',')
        .map(s => s.replace(/['"]/g, '').trim())
        .filter(s => s.length > 0);
      moduleAllExports = new Set(items);
      break;
    }
  }

  let i = 0;
  let pendingDecorators: string[] = [];
  let decoratorStartLine: number | null = null;
  let decoratorStartCol: number | null = null;
  let decoratorComments: string[] = [];

  while (i < statements.length) {
    const stmt = statements[i];
    const text = stmt.text.trim();

    // 1. 暂存装饰器 @decorator
    if (text.startsWith('@')) {
      if (pendingDecorators.length === 0) {
        decoratorStartLine = stmt.startLine;
        decoratorStartCol = stmt.startCol;
        decoratorComments = stmt.leadingComments;
      }
      pendingDecorators.push(text);
      i++;
      continue;
    }

    const startLine = decoratorStartLine ?? stmt.startLine;
    const startCol = decoratorStartCol ?? stmt.startCol;
    const leadingComments =
      decoratorComments.length > 0 ? decoratorComments : stmt.leadingComments;

    // 2. 匹配类定义: class ClassName[(Bases)]:
    const classMatch = text.match(/^class\s+([a-zA-Z_]\w*)(?:\s*\((.*?)\))?\s*:/s);
    if (classMatch) {
      const className = classMatch[1];
      const rawBases = classMatch[2] ? classMatch[2].trim() : '';
      const bases = rawBases ? splitTopLevel(rawBases, ',').map(b => b.trim()).filter(b => b) : [];
      const classId = `${normFilePath}#${className}`;

      const classIndent = stmt.indent;
      const classDecorators = [...pendingDecorators];
      pendingDecorators = [];
      decoratorStartLine = null;
      decoratorStartCol = null;
      decoratorComments = [];

      // 提取类范围内的所有子语句（类体缩进 > classIndent）
      const classSubStmts: RawStatement[] = [];
      let nextIdx = i + 1;
      while (nextIdx < statements.length) {
        const nextStmt = statements[nextIdx];
        if (nextStmt.indent > classIndent) {
          classSubStmts.push(nextStmt);
          nextIdx++;
        } else {
          break;
        }
      }

      const endLine =
        classSubStmts.length > 0
          ? classSubStmts[classSubStmts.length - 1].endLine
          : stmt.endLine;
      const endCol =
        classSubStmts.length > 0
          ? classSubStmts[classSubStmts.length - 1].endCol
          : stmt.endCol;

      // 提取类 Docstring（类体首个字符串语句）
      let rawDocstring: string | undefined;
      let firstStmtIdx = 0;
      if (classSubStmts.length > 0) {
        const firstStmt = classSubStmts[0];
        const trimmedFirst = firstStmt.text.trim();
        if (
          trimmedFirst.startsWith('"""') ||
          trimmedFirst.startsWith("'''") ||
          trimmedFirst.startsWith('"') ||
          trimmedFirst.startsWith("'")
        ) {
          rawDocstring = trimmedFirst;
          firstStmtIdx = 1;
        }
      }

      const docstring = parseDocstring(rawDocstring, leadingComments);

      // 解析类成员方法
      const methodIds: string[] = [];
      let mIdx = firstStmtIdx;
      let methodDecorators: string[] = [];
      let methodDecStartLine: number | null = null;
      let methodDecStartCol: number | null = null;
      let methodDecComments: string[] = [];

      while (mIdx < classSubStmts.length) {
        const mStmt = classSubStmts[mIdx];
        const mText = mStmt.text.trim();

        if (mText.startsWith('@')) {
          if (methodDecorators.length === 0) {
            methodDecStartLine = mStmt.startLine;
            methodDecStartCol = mStmt.startCol;
            methodDecComments = mStmt.leadingComments;
          }
          methodDecorators.push(mText);
          mIdx++;
          continue;
        }

        const funcMatch = mText.match(/^(?:(async)\s+)?def\s+([a-zA-Z_]\w*)\s*\((.*?)\)(?:\s*->\s*(.*?))?\s*:/s);
        if (funcMatch) {
          const isAsync = !!funcMatch[1];
          const methodName = funcMatch[2];
          const rawParams = funcMatch[3];
          const rawReturn = funcMatch[4];
          const methodId = `${classId}.${methodName}`;
          methodIds.push(methodId);

          const mStartLine = methodDecStartLine ?? mStmt.startLine;
          const mStartCol = methodDecStartCol ?? mStmt.startCol;
          const mComments = methodDecComments.length > 0 ? methodDecComments : mStmt.leadingComments;

          // 收集方法体语句（缩进 > mStmt.indent）
          const methodSubStmts: RawStatement[] = [];
          let mNext = mIdx + 1;
          while (mNext < classSubStmts.length) {
            if (classSubStmts[mNext].indent > mStmt.indent) {
              methodSubStmts.push(classSubStmts[mNext]);
              mNext++;
            } else {
              break;
            }
          }

          const mEndLine = methodSubStmts.length > 0 ? methodSubStmts[methodSubStmts.length - 1].endLine : mStmt.endLine;
          const mEndCol = methodSubStmts.length > 0 ? methodSubStmts[methodSubStmts.length - 1].endCol : mStmt.endCol;

          // 方法 Docstring
          let mDocstringRaw: string | undefined;
          let mBodyStartLine = mStmt.endLine + 1;
          if (methodSubStmts.length > 0) {
            const firstMStmt = methodSubStmts[0];
            const trimmedMFirst = firstMStmt.text.trim();
            if (
              trimmedMFirst.startsWith('"""') ||
              trimmedMFirst.startsWith("'''") ||
              trimmedMFirst.startsWith('"') ||
              trimmedMFirst.startsWith("'")
            ) {
              mDocstringRaw = trimmedMFirst;
              mBodyStartLine = firstMStmt.endLine + 1;
            }
          }

          const mDocstring = parseDocstring(mDocstringRaw, mComments);

          // 截取方法体文本用于推导返回类型与调用位置
          const bodyLines = rawLines.slice(mBodyStartLine - 1, mEndLine);
          const bodyText = bodyLines.join('\n');

          const parameters = parseParameters(rawParams);
          const returnType = parseReturnType(rawReturn, bodyText);

          // 确定方法 kind
          let kind: FunctionNode['kind'] = 'method';
          if (methodDecorators.some(d => d.includes('@classmethod'))) {
            kind = 'class_method';
          } else if (methodDecorators.some(d => d.includes('@staticmethod'))) {
            kind = 'static_method';
          } else if (isAsync) {
            kind = 'async_function';
          }

          const methodNode: FunctionNode = {
            id: methodId,
            name: methodName,
            filePath: normFilePath,
            kind,
            parentClassId: classId,
            range: {
              startLine: mStartLine,
              startColumn: mStartCol,
              endLine: mEndLine,
              endColumn: mEndCol
            },
            decorators: [...methodDecorators],
            docstring: mDocstring,
            parameters,
            returnType,
            isExported: false,
            isDeadCodeCandidate: false
          };

          symbols.push(methodNode);

          // 提取方法体内部的调用表达式
          const methodCalls = extractCallSites(bodyText, mBodyStartLine, methodId);
          callSites.push(...methodCalls);

          methodDecorators = [];
          methodDecStartLine = null;
          methodDecStartCol = null;
          methodDecComments = [];
          mIdx = mNext;
          continue;
        }

        methodDecorators = [];
        methodDecStartLine = null;
        methodDecStartCol = null;
        methodDecComments = [];
        mIdx++;
      }

      const isExported = moduleAllExports
        ? moduleAllExports.has(className)
        : (normFilePath.endsWith('__init__.py') && !className.startsWith('_'));

      const classNode: ClassNode = {
        id: classId,
        name: className,
        filePath: normFilePath,
        kind: 'class',
        bases,
        methods: methodIds,
        range: {
          startLine,
          startColumn: startCol,
          endLine,
          endColumn: endCol
        },
        decorators: classDecorators,
        docstring,
        isExported,
        isDeadCodeCandidate: false
      };

      symbols.push(classNode);
      i = nextIdx;
      continue;
    }

    // 3. 匹配顶层函数: [async] def funcName(params) [-> Ret]:
    const topFuncMatch = text.match(/^(?:(async)\s+)?def\s+([a-zA-Z_]\w*)\s*\((.*?)\)(?:\s*->\s*(.*?))?\s*:/s);
    if (topFuncMatch) {
      const isAsync = !!topFuncMatch[1];
      const funcName = topFuncMatch[2];
      const rawParams = topFuncMatch[3];
      const rawReturn = topFuncMatch[4];
      const funcId = `${normFilePath}#${funcName}`;

      const funcIndent = stmt.indent;
      const funcDecorators = [...pendingDecorators];
      pendingDecorators = [];
      decoratorStartLine = null;
      decoratorStartCol = null;
      decoratorComments = [];

      // 提取函数体子语句
      const funcSubStmts: RawStatement[] = [];
      let nextIdx = i + 1;
      while (nextIdx < statements.length) {
        const nextStmt = statements[nextIdx];
        if (nextStmt.indent > funcIndent) {
          funcSubStmts.push(nextStmt);
          nextIdx++;
        } else {
          break;
        }
      }

      const endLine =
        funcSubStmts.length > 0
          ? funcSubStmts[funcSubStmts.length - 1].endLine
          : stmt.endLine;
      const endCol =
        funcSubStmts.length > 0
          ? funcSubStmts[funcSubStmts.length - 1].endCol
          : stmt.endCol;

      // 提取函数 Docstring
      let rawDocstring: string | undefined;
      let bodyStartLine = stmt.endLine + 1;
      if (funcSubStmts.length > 0) {
        const firstStmt = funcSubStmts[0];
        const trimmedFirst = firstStmt.text.trim();
        if (
          trimmedFirst.startsWith('"""') ||
          trimmedFirst.startsWith("'''") ||
          trimmedFirst.startsWith('"') ||
          trimmedFirst.startsWith("'")
        ) {
          rawDocstring = trimmedFirst;
          bodyStartLine = firstStmt.endLine + 1;
        }
      }

      const docstring = parseDocstring(rawDocstring, leadingComments);

      // 获取函数体代码并推导返回类型
      const bodyLines = rawLines.slice(bodyStartLine - 1, endLine);
      const bodyText = bodyLines.join('\n');

      const parameters = parseParameters(rawParams);
      const returnType = parseReturnType(rawReturn, bodyText);

      const isExported = moduleAllExports
        ? moduleAllExports.has(funcName)
        : (normFilePath.endsWith('__init__.py') && !funcName.startsWith('_'));

      const funcNode: FunctionNode = {
        id: funcId,
        name: funcName,
        filePath: normFilePath,
        kind: isAsync ? 'async_function' : 'function',
        range: {
          startLine,
          startColumn: startCol,
          endLine,
          endColumn: endCol
        },
        decorators: funcDecorators,
        docstring,
        parameters,
        returnType,
        isExported,
        isDeadCodeCandidate: false
      };

      symbols.push(funcNode);

      // 提取函数体内部的调用表达式
      const calls = extractCallSites(bodyText, bodyStartLine, funcId);
      callSites.push(...calls);

      i = nextIdx;
      continue;
    }

    // 提取模块级顶层其他语句（如 if __name__ == '__main__': ... 或直接运行的脚本逻辑）中的调用表达式
    const topCalls = extractCallSites(stmt.text, stmt.startLine, `${normFilePath}#<module>`);
    if (topCalls.length > 0) {
      hasTopLevelExecution = true;
      callSites.push(...topCalls);
      for (const call of topCalls) {
        scriptPipeline.push({
          step: scriptPipeline.length + 1,
          line: call.line,
          calleeName: call.calleeName,
          callSnippet: stmt.text.trim().split('\n')[0].slice(0, 60),
        });
      }
    }

    // 重置未消耗的装饰器
    pendingDecorators = [];
    decoratorStartLine = null;
    decoratorStartCol = null;
    decoratorComments = [];
    i++;
  }

  return {
    filePath: normFilePath,
    symbols,
    imports,
    callSites,
    hasTopLevelExecution,
    isScriptEntry: hasTopLevelExecution,
    scriptPipeline,
  };
}
