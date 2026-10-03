/**
 * DeadCodeDetector - 孤立死代码雷达检测算法
 * 识别入度为 0 的孤立函数与孤立未引用类，内置完善的框架级白名单过滤机制
 */

import { GraphManager } from './graphManager';
import { SymbolNode, FunctionNode, ClassNode } from '../types';

export interface DeadCodeDetectorOptions {
  /**
   * 是否在计算入度时忽略 contains 结构边 (默认为 true)
   * 设为 true 时，类内部从没有被调用过的成员方法其有效调用入度即为 0，可被判定为死代码候选
   */
  ignoreContainsEdges?: boolean;

  /**
   * 是否检测类成员方法 (若为 false，则仅检测顶层函数和类，默认为 true)
   */
  includeMethods?: boolean;

  /**
   * 是否同步就地更新节点对象的 isDeadCodeCandidate 标志属性 (默认为 false)
   */
  updateNodeFlag?: boolean;

  /**
   * 外部扩展的自定义白名单判定函数
   * 返回 true 则该节点被豁免，不作为死代码候选
   */
  customWhitelist?: (node: SymbolNode, graphManager: GraphManager) => boolean;
}

export interface DeadCodeCandidate {
  /**
   * 候选节点对象
   */
  node: SymbolNode;

  /**
   * 计算得出的有效引用入度
   */
  effectiveInDegree: number;

  /**
   * 判定原因说明
   */
  reason: string;
}

/**
 * 框架入口装饰器正则集合
 */
const FRAMEWORK_DECORATOR_PATTERNS: RegExp[] = [
  // Web 路由入口 (FastAPI / Flask / Starlette / Django / Sanic / Litestar / Tornado / Bottle)
  /^@(app|router|api_router|bp|blueprint|server|api)\.(get|post|put|delete|patch|options|head|route|websocket|api_route|on_event|middleware|exception_handler)\b/i,
  /^@(app|router|api_router|bp|blueprint)\./i,

  // CLI 命令行入口 (Click / Typer / Fire / Argparse)
  /^@(click|typer|app|cli|main)\.(command|group|callback|argument|option)\b/i,
  /^@click\./i,
  /^@typer\./i,

  // 异步任务与定时任务 (Celery / Dramatiq / RQ / APScheduler)
  /^@(shared_task|task|job|actor)\b/i,
  /^@(app|celery)\.task\b/i,

  // Django 信号与管理后台
  /^@(receiver|admin\.register)\b/i,

  // 观察者与事件监听
  /^@(listener|consumer|event_handler|subscriber)\b/i,

  // 接口定义契约 (抽象类或显式重写契约)
  /^@(abstractmethod|abc\.abstractmethod|override|overload)\b/i,

  // Pydantic / Marshmallow 校验器
  /^@(validator|field_validator|model_validator|root_validator)\b/i
];

/**
 * 测试框架装饰器正则集合 (pytest / unittest)
 */
const TEST_DECORATOR_PATTERNS: RegExp[] = [
  /^@pytest\.(fixture|mark|hookimpl)/i,
  /^@(fixture|pytest_fixture)\b/i,
  /^@unittest\.(skip|skipIf|skipUnless)/i
];

export class DeadCodeDetector {
  private graphManager: GraphManager;

  constructor(graphManager: GraphManager) {
    this.graphManager = graphManager;
  }

  /**
   * 静态快速检测入口
   */
  public static detect(
    graphManager: GraphManager,
    options?: DeadCodeDetectorOptions
  ): SymbolNode[] {
    const detector = new DeadCodeDetector(graphManager);
    return detector.detect(options);
  }

  /**
   * 检测死代码候选节点列表
   */
  public detect(options: DeadCodeDetectorOptions = {}): SymbolNode[] {
    const details = this.detectWithDetails(options);
    return details.map(item => item.node);
  }

  /**
   * 检测并返回包含详细入度与原因的候选列表
   */
  public detectWithDetails(options: DeadCodeDetectorOptions = {}): DeadCodeCandidate[] {
    const ignoreContains = options.ignoreContainsEdges ?? true;
    const includeMethods = options.includeMethods ?? true;
    const updateFlag = options.updateNodeFlag ?? false;
    const customFilter = options.customWhitelist;

    const allNodes = this.graphManager.getAllNodes();
    const candidates: DeadCodeCandidate[] = [];

    for (const node of allNodes) {
      // 1. 若不包含类方法且当前为成员方法，则跳过
      const isMethod = node.kind === 'method' || node.kind === 'class_method' || node.kind === 'static_method';
      if (!includeMethods && isMethod) {
        if (updateFlag) node.isDeadCodeCandidate = false;
        continue;
      }

      // 2. 检查白名单豁免规则
      if (this.isWhitelisted(node, customFilter)) {
        if (updateFlag) node.isDeadCodeCandidate = false;
        continue;
      }

      // 3. 计算有效引用入度
      const inEdges = this.graphManager.getInEdges(node.id);
      let effectiveInDegree = 0;

      for (const edge of inEdges) {
        // 如果忽略 contains 边，则仅统计真实调用/实例化/继承引用
        if (ignoreContains && edge.kind === 'contains') {
          continue;
        }
        effectiveInDegree++;
      }

      // 4. 检查是否有真实调用记录 (包含脚本顶层与函数内部)
      const totalUsages = (node.usages && node.usages.length > 0) ? node.usages.length : 0;

      // 5. 若有效入度为 0 且无任何实际调用记录，判定为死代码候选
      if (effectiveInDegree === 0 && totalUsages === 0) {
        if (updateFlag) {
          node.isDeadCodeCandidate = true;
        }

        const kindDesc = node.kind === 'class' ? '类' : isMethod ? '类成员方法' : '函数';
        candidates.push({
          node,
          effectiveInDegree: 0,
          reason: `孤立未被引用的${kindDesc}，无调用、继承或实例化入度边，在脚本顶层亦无调用记录，且未命中白名单豁免`
        });
      } else {
        if (updateFlag) {
          node.isDeadCodeCandidate = false;
        }
      }
    }

    return candidates;
  }

  /**
   * 执行检测并直接更新图中所有节点的 isDeadCodeCandidate 标志
   */
  public markCandidates(options: DeadCodeDetectorOptions = {}): SymbolNode[] {
    return this.detect({
      ...options,
      updateNodeFlag: true
    });
  }

  // ==========================================
  // 白名单规则判定
  // ==========================================

  /**
   * 统一白名单总评定
   */
  public isWhitelisted(
    node: SymbolNode,
    customFilter?: (node: SymbolNode, graphManager: GraphManager) => boolean
  ): boolean {
    // 规则 1: 忽略公共导出 (__all__、__init__.py 中暴露的实体)
    if (this.isPublicExport(node)) {
      return true;
    }

    // 规则 2: 忽略测试函数与测试类
    if (this.isTestEntity(node)) {
      return true;
    }

    // 规则 3: 忽略框架入口装饰器
    if (this.isFrameworkEntryPoint(node)) {
      return true;
    }

    // 规则 4: 忽略 Python 魔法方法与生命周期钩子
    if (this.isMagicMethod(node)) {
      return true;
    }

    // 规则 5: 忽略主执行入口 main 函数
    if (this.isMainEntryPoint(node)) {
      return true;
    }

    // 规则 6: 自定义外部白名单
    if (customFilter && customFilter(node, this.graphManager)) {
      return true;
    }

    return false;
  }

  /**
   * 规则 1: 忽略公共导出
   * - node.isExported 为 true (由 AST 解析出的 __all__ 声明或显式导出标记)
   * - 位于 __init__.py 模块中的实体（作为包对外暴露 API）
   */
  public isPublicExport(node: SymbolNode): boolean {
    if (node.isExported) {
      return true;
    }

    const normalizedPath = node.filePath.replace(/\\/g, '/');
    if (
      normalizedPath.endsWith('__init__.py') ||
      normalizedPath.includes('/__init__.py')
    ) {
      return true;
    }

    return false;
  }

  /**
   * 规则 2: 忽略测试函数与测试类
   * - 名称以 test_ 开头、以 _test 结尾的函数/方法
   * - 类名以 Test 开头、包含 Test 或以 TestCase 结尾的类
   * - 被 @pytest.fixture 或相关测试装饰器修饰的实体
   * - 位于 tests/ 或 test_*.py 文件中的实体
   */
  public isTestEntity(node: SymbolNode): boolean {
    const name = node.name;

    // 函数/方法命名规则
    if (name.startsWith('test_') || name.endsWith('_test')) {
      return true;
    }

    // 测试类命名规则
    if (node.kind === 'class') {
      if (name.startsWith('Test') || name.endsWith('Test') || name.endsWith('TestCase')) {
        return true;
      }
    }

    // 装饰器匹配
    if (node.decorators && node.decorators.length > 0) {
      for (const dec of node.decorators) {
        if (TEST_DECORATOR_PATTERNS.some(pattern => pattern.test(dec))) {
          return true;
        }
      }
    }

    // 文件路径特征 (位于 tests 目录下或测试脚本中)
    const normalizedPath = node.filePath.replace(/\\/g, '/');
    if (
      /(^|\/)test_[^/]+\.py$/i.test(normalizedPath) ||
      /(^|\/)[^/]+_test\.py$/i.test(normalizedPath) ||
      /(^|\/)tests?(\/|$)/i.test(normalizedPath)
    ) {
      return true;
    }

    return false;
  }

  /**
   * 规则 3: 忽略框架入口
   * - FastAPI / Flask / Starlette / Django 路由处理函数 (@app.get, @app.post, @router.* 等)
   * - Click / Typer / Fire 命令行装饰器 (@click.command, @app.command 等)
   * - Celery 任务、Django Signal receiver、接口抽象方法等
   */
  public isFrameworkEntryPoint(node: SymbolNode): boolean {
    if (!node.decorators || node.decorators.length === 0) {
      return false;
    }

    for (const dec of node.decorators) {
      for (const pattern of FRAMEWORK_DECORATOR_PATTERNS) {
        if (pattern.test(dec)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 规则 4: 忽略 Python 魔法方法与生命周期钩子
   * - 双下划线命名: __init__, __str__, __repr__, __enter__, __exit__, __len__, __call__ 等
   * - Dataclass 生命周期钩子: __post_init__
   */
  public isMagicMethod(node: SymbolNode): boolean {
    const name = node.name;
    // 匹配 __xxx__ 或 __post_init__
    if (/^__[a-zA-Z0-9_]+__$/.test(name) || name === '__post_init__') {
      return true;
    }
    return false;
  }

  /**
   * 规则 5: 忽略标准命令行执行入口 main
   * - 顶层函数名为 main 或 cli 或 run
   */
  public isMainEntryPoint(node: SymbolNode): boolean {
    if (node.kind === 'function' || node.kind === 'async_function') {
      if (node.name === 'main' || node.name === 'cli' || node.name === 'run') {
        return true;
      }
    }
    return false;
  }
}
