import { ILanguageParser } from './languageParser';
import { PythonLanguageParser } from './pythonLanguageParser';
import { TsLanguageParser } from './tsLanguageParser';

/**
 * 多语言解析器注册分发中心
 */
export class ParserRegistry {
  private static parsers: ILanguageParser[] = [];

  public static register(parser: ILanguageParser): void {
    // 避免重复注册同名解析器
    this.parsers = this.parsers.filter(p => p.languageId !== parser.languageId);
    this.parsers.push(parser);
  }

  /**
   * 根据文件路径查找支持的解析器
   */
  public static getParserForFile(filePath: string): ILanguageParser | undefined {
    const extMatch = filePath.match(/\.[^.]+$/);
    if (!extMatch) return undefined;
    const ext = extMatch[0].toLowerCase();
    return this.parsers.find(p => p.supportedExtensions.includes(ext));
  }

  /**
   * 获取所有注册解析器支持的通配扩展名模式列表
   */
  public static getSupportedExtensions(): string[] {
    const set = new Set<string>();
    for (const p of this.parsers) {
      for (const e of p.supportedExtensions) {
        set.add(e);
      }
    }
    return Array.from(set);
  }

  /**
   * 构造 VS Code findFiles glob 匹配模式
   * 例如: "**\/*.{py,ts,tsx,js,jsx}"
   */
  public static getGlobPattern(): string {
    const exts = this.getSupportedExtensions().map(e => e.replace(/^\./, ''));
    if (exts.length === 0) return '**/*.py';
    if (exts.length === 1) return `**/*.${exts[0]}`;
    return `**/*.{${exts.join(',')}}`;
  }
}

// 默认自动注册内置解析器
ParserRegistry.register(new PythonLanguageParser());
ParserRegistry.register(new TsLanguageParser());
