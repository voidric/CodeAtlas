import * as ts from 'typescript';
import { ILanguageParser } from './languageParser';
import {
  CallSiteInfo,
  ClassNode,
  DocstringInfo,
  FileImport,
  FileParseResult,
  FunctionNode,
  Parameter,
  SourceRange,
  SymbolNode,
} from '../types';

/**
 * TypeScript / JavaScript 语言 AST 解析器
 * 基于官方 TypeScript Compiler API，支持 .ts, .tsx, .js, .jsx 深度语法分析
 */
export class TsLanguageParser implements ILanguageParser {
  public readonly languageId = 'typescript';
  public readonly supportedExtensions = ['.ts', '.tsx', '.js', '.jsx'];

  public parse(code: string, relativePath: string): FileParseResult {
    const normPath = relativePath.replace(/\\/g, '/');
    const sourceFile = ts.createSourceFile(
      normPath,
      code,
      ts.ScriptTarget.Latest,
      true
    );

    const symbols: SymbolNode[] = [];
    const imports: FileImport[] = [];
    const callSites: CallSiteInfo[] = [];

    // 作用域调用栈，用于跟踪调用表达式属于哪一个外层函数或类
    let currentEnclosingSymbolId: string | null = null;

    // 辅助获取源码范围
    function getRange(node: ts.Node): SourceRange {
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
      return {
        startLine: start.line + 1,
        startColumn: start.character + 1,
        endLine: end.line + 1,
        endColumn: end.character + 1,
      };
    }

    // 提取 JSDoc 注释
    function extractJsDoc(node: ts.Node): DocstringInfo | undefined {
      const fullText = sourceFile.getFullText();
      const comments = ts.getLeadingCommentRanges(fullText, node.getFullStart());
      if (!comments || comments.length === 0) return undefined;

      const lastComment = comments[comments.length - 1];
      const commentText = fullText.substring(lastComment.pos, lastComment.end);

      // 清除 /** 和 */ 以及每行的 *
      const lines = commentText
        .replace(/^\/\*\*?/, '')
        .replace(/\*\/$/, '')
        .split('\n')
        .map(l => l.replace(/^\s*\*\s?/, '').trim())
        .filter(l => Boolean(l) && !l.startsWith('@param') && !l.startsWith('@returns') && !l.startsWith('@return'));

      if (lines.length === 0) return undefined;

      return {
        summary: lines[0],
        description: lines.length > 1 ? lines.slice(1).join(' ') : undefined,
      };
    }

    // 提取函数形参列表
    function extractParams(parameters: ts.NodeArray<ts.ParameterDeclaration>): Parameter[] {
      return parameters.map(p => {
        let kind: Parameter['kind'] = 'positional';
        if (p.dotDotDotToken) {
          kind = 'args';
        }

        return {
          name: p.name.getText(sourceFile),
          typeHint: p.type ? p.type.getText(sourceFile) : undefined,
          defaultValue: p.initializer ? p.initializer.getText(sourceFile) : undefined,
          kind,
        };
      });
    }

    // 遍历 AST 节点
    function visit(node: ts.Node) {
      // 1. 提取 Import 语句
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
        const isRelative = moduleSpecifier.startsWith('.');

        if (node.importClause) {
          // 默认导入: import Foo from './foo'
          if (node.importClause.name) {
            imports.push({
              raw: node.getText(sourceFile),
              moduleName: moduleSpecifier,
              importedSymbol: node.importClause.name.getText(sourceFile),
              isRelative,
            });
          }

          // 命名导入: import { a, b as c } from './foo'
          if (node.importClause.namedBindings) {
            if (ts.isNamedImports(node.importClause.namedBindings)) {
              for (const element of node.importClause.namedBindings.elements) {
                imports.push({
                  raw: node.getText(sourceFile),
                  moduleName: moduleSpecifier,
                  importedSymbol: element.propertyName ? element.propertyName.getText(sourceFile) : element.name.getText(sourceFile),
                  alias: element.name.getText(sourceFile),
                  isRelative,
                });
              }
            } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
              // import * as Foo from './foo'
              imports.push({
                raw: node.getText(sourceFile),
                moduleName: moduleSpecifier,
                alias: node.importClause.namedBindings.name.getText(sourceFile),
                isWildcard: true,
                isRelative,
              });
            }
          }
        }
      }

      // 2. 提取类 (ClassDeclaration)
      else if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.getText(sourceFile);
        const classId = `${normPath}#${className}`;

        const bases: string[] = [];
        if (node.heritageClauses) {
          for (const clause of node.heritageClauses) {
            for (const type of clause.types) {
              bases.push(type.expression.getText(sourceFile));
            }
          }
        }

        const methodIds: string[] = [];
        const classNode: ClassNode = {
          id: classId,
          name: className,
          kind: 'class',
          filePath: normPath,
          range: getRange(node),
          decorators: [],
          docstring: extractJsDoc(node),
          isExported: Boolean(node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)),
          isDeadCodeCandidate: false,
          bases,
          methods: methodIds,
        };
        symbols.push(classNode);

        const prevEnclosing = currentEnclosingSymbolId;
        currentEnclosingSymbolId = classId;

        // 遍历类成员
        for (const member of node.members) {
          if (ts.isMethodDeclaration(member) && member.name) {
            const methodName = member.name.getText(sourceFile);
            const methodId = `${normPath}#${className}.${methodName}`;
            methodIds.push(methodId);

            const fnNode: FunctionNode = {
              id: methodId,
              name: methodName,
              kind: member.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword) ? 'class_method' : 'method',
              filePath: normPath,
              range: getRange(member),
              decorators: [],
              docstring: extractJsDoc(member),
              isExported: classNode.isExported,
              isDeadCodeCandidate: false,
              parentClassId: classId,
              parameters: extractParams(member.parameters),
              returnType: member.type ? member.type.getText(sourceFile) : undefined,
            };
            symbols.push(fnNode);

            // 递归解析成员方法体内部调用
            const prevMethod: string | null = currentEnclosingSymbolId;
            currentEnclosingSymbolId = methodId;
            if (member.body) {
              ts.forEachChild(member.body, visit);
            }
            currentEnclosingSymbolId = prevMethod;
          } else if (ts.isConstructorDeclaration(member)) {
            const ctorId = `${normPath}#${className}.constructor`;
            methodIds.push(ctorId);

            const fnNode: FunctionNode = {
              id: ctorId,
              name: 'constructor',
              kind: 'method',
              filePath: normPath,
              range: getRange(member),
              decorators: [],
              docstring: extractJsDoc(member),
              isExported: classNode.isExported,
              isDeadCodeCandidate: false,
              parentClassId: classId,
              parameters: extractParams(member.parameters),
              returnType: className,
            };
            symbols.push(fnNode);

            const prevCtor: string | null = currentEnclosingSymbolId;
            currentEnclosingSymbolId = ctorId;
            if (member.body) {
              ts.forEachChild(member.body, visit);
            }
            currentEnclosingSymbolId = prevCtor;
          }
        }

        currentEnclosingSymbolId = prevEnclosing;
        return;
      }

      // 3. 提取顶层函数 (FunctionDeclaration)
      else if (ts.isFunctionDeclaration(node) && node.name) {
        const fnName = node.name.getText(sourceFile);
        const fnId = `${normPath}#${fnName}`;

        const isAsync = Boolean(node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword));
        const fnNode: FunctionNode = {
          id: fnId,
          name: fnName,
          kind: isAsync ? 'async_function' : 'function',
          filePath: normPath,
          range: getRange(node),
          decorators: [],
          docstring: extractJsDoc(node),
          isExported: Boolean(node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)),
          isDeadCodeCandidate: false,
          parameters: extractParams(node.parameters),
          returnType: node.type ? node.type.getText(sourceFile) : undefined,
        };
        symbols.push(fnNode);

        const prevEnclosing = currentEnclosingSymbolId;
        currentEnclosingSymbolId = fnId;
        if (node.body) {
          ts.forEachChild(node.body, visit);
        }
        currentEnclosingSymbolId = prevEnclosing;
        return;
      }

      // 4. 提取变量声明中的函数 (const fn = () => ...)
      else if (ts.isVariableStatement(node)) {
        const isExported = Boolean(node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword));
        for (const decl of node.declarationList.declarations) {
          if (
            decl.name &&
            decl.initializer &&
            (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
          ) {
            const fnName = decl.name.getText(sourceFile);
            const fnId = `${normPath}#${fnName}`;
            const init = decl.initializer;

            const isAsync = Boolean(init.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword));
            const fnNode: FunctionNode = {
              id: fnId,
              name: fnName,
              kind: isAsync ? 'async_function' : 'function',
              filePath: normPath,
              range: getRange(decl),
              decorators: [],
              docstring: extractJsDoc(node),
              isExported,
              isDeadCodeCandidate: false,
              parameters: extractParams(init.parameters),
              returnType: init.type ? init.type.getText(sourceFile) : undefined,
            };
            symbols.push(fnNode);

            const prevEnclosing = currentEnclosingSymbolId;
            currentEnclosingSymbolId = fnId;
            if (init.body) {
              ts.forEachChild(init.body, visit);
            }
            currentEnclosingSymbolId = prevEnclosing;
          }
        }
      }

      // 5. 提取函数调用 (CallExpression / NewExpression)
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const callerId = currentEnclosingSymbolId || `${normPath}#<module>`;
        const calleeText = node.expression.getText(sourceFile);
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

        callSites.push({
          calleeName: calleeText,
          line: pos.line + 1,
          column: pos.character + 1,
          callerSymbolId: callerId,
        });
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    return {
      filePath: normPath,
      symbols,
      imports,
      callSites,
    };
  }
}
