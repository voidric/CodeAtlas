import { FileParseResult } from '../types';

/**
 * 多语言解析器统一接口规范
 */
export interface ILanguageParser {
  /**
   * 语言唯一标识 (如 'python', 'typescript')
   */
  readonly languageId: string;

  /**
   * 支持的文件扩展名列表 (全部小写，含点，如 ['.ts', '.tsx', '.js', '.jsx'])
   */
  readonly supportedExtensions: string[];

  /**
   * 解析单文件源代码生成通用符号与调用点
   * @param code 文件源码文本
   * @param relativePath 相对工程根目录文件路径
   */
  parse(code: string, relativePath: string): FileParseResult;
}
