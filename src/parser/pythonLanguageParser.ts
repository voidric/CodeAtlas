import { ILanguageParser } from './languageParser';
import { FileParseResult } from '../types';
import { parsePythonFile } from './pythonParser';

/**
 * Python 语法树解析器适配器
 */
export class PythonLanguageParser implements ILanguageParser {
  public readonly languageId = 'python';
  public readonly supportedExtensions = ['.py'];

  public parse(code: string, relativePath: string): FileParseResult {
    return parsePythonFile(code, relativePath);
  }
}
