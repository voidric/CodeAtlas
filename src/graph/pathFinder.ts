/**
 * PathFinder - 端到端调用链路寻路算法
 * 支持基于 BFS (跳数最短) 与 Dijkstra (语义最优权重) 的拓扑链路搜索
 * 返回供 Webview 渲染高亮的有序节点及边序列
 */

import { GraphManager } from './graphManager';
import { SymbolNode, RelationEdge, EdgeKind } from '../types';

export interface PathFinderOptions {
  /**
   * 寻路算法类型:
   * - 'bfs': 寻找经过跳数 (Hops) 最少的最短链路
   * - 'dijkstra': 结合边关系权重寻找调用语义最优先的最优链路
   * 默认为 'bfs'
   */
  algorithm?: 'bfs' | 'dijkstra';

  /**
   * 限制寻路允许经过的关系类型
   * 若不指定，则遍历所有方向向下的调用与结构边
   */
  edgeKinds?: EdgeKind[];

  /**
   * 最大搜索深度/跳数限制，防止超大图中长尾搜索耗时，默认 50
   */
  maxDepth?: number;

  /**
   * 当两个节点之间存在多条不同类型的关联边时，优先选取 calls 关系，默认为 true
   */
  preferCalls?: boolean;

  /**
   * Dijkstra 算法各边类型的自定义代价权重
   */
  weights?: Partial<Record<EdgeKind, number>>;
}

export interface PathResult {
  /**
   * 是否成功找到连通链路
   */
  found: boolean;

  /**
   * 有序节点列表 (从 fromSymbol 到 toSymbol)
   */
  nodes: SymbolNode[];

  /**
   * 有序边列表 (edges[i] 连接 nodes[i] 到 nodes[i+1])
   */
  edges: RelationEdge[];

  /**
   * 有序节点 ID 列表 (直接供给 Webview HIGHLIGHT_PATH 协议)
   */
  nodeIds: string[];

  /**
   * 有序边 ID 列表 (直接供给 Webview HIGHLIGHT_PATH 协议)
   */
  edgeIds: string[];

  /**
   * 链路总跳数 (边数量)
   */
  totalHops: number;

  /**
   * 链路总代价 (仅在 dijkstra 下有意义)
   */
  totalCost?: number;

  /**
   * 状态或错误提示信息
   */
  message?: string;
}

const DEFAULT_WEIGHTS: Record<EdgeKind, number> = {
  calls: 1.0,         // 函数/方法直接调用，权重最低最优先
  instantiates: 1.2,  // 实例化类
  inherits: 1.8,      // 继承基类
  contains: 2.5       // 类内部包含方法，结构性关系权重稍高
};

export class PathFinder {
  private graphManager: GraphManager;

  constructor(graphManager: GraphManager) {
    this.graphManager = graphManager;
  }

  /**
   * 静态快速寻路入口
   */
  public static findPath(
    graphManager: GraphManager,
    fromSymbolId: string,
    toSymbolId: string,
    options?: PathFinderOptions
  ): PathResult {
    const finder = new PathFinder(graphManager);
    return finder.findPath(fromSymbolId, toSymbolId, options);
  }

  /**
   * 执行端到端调用链寻路
   */
  public findPath(
    fromSymbolId: string,
    toSymbolId: string,
    options: PathFinderOptions = {}
  ): PathResult {
    const algorithm = options.algorithm || 'bfs';

    // 基础边界检查
    const fromNode = this.graphManager.getNode(fromSymbolId);
    if (!fromNode) {
      return this.createFailureResult(`起点实体未找到: "${fromSymbolId}"`);
    }

    const toNode = this.graphManager.getNode(toSymbolId);
    if (!toNode) {
      return this.createFailureResult(`终点实体未找到: "${toSymbolId}"`);
    }

    // 起终点相同时直接返回单节点路径
    if (fromSymbolId === toSymbolId) {
      return {
        found: true,
        nodes: [fromNode],
        edges: [],
        nodeIds: [fromSymbolId],
        edgeIds: [],
        totalHops: 0,
        totalCost: 0,
        message: '起点与终点为同一实体'
      };
    }

    if (algorithm === 'dijkstra') {
      return this.searchDijkstra(fromSymbolId, toSymbolId, options);
    } else {
      return this.searchBFS(fromSymbolId, toSymbolId, options);
    }
  }

  /**
   * 基于广度优先搜索 (BFS) 的最短跳数链路寻路
   */
  private searchBFS(
    fromSymbolId: string,
    toSymbolId: string,
    options: PathFinderOptions
  ): PathResult {
    const maxDepth = options.maxDepth ?? 50;
    const allowedKinds = options.edgeKinds ? new Set(options.edgeKinds) : null;
    const graph = this.graphManager.getGraph();

    // 记录访问过的节点以防循环
    const visited = new Set<string>([fromSymbolId]);

    // 记录到达当前节点的前驱信息: nodeId -> { prevId, edge }
    const cameFrom = new Map<string, { prevId: string; edge: RelationEdge }>();

    // 记录搜索深度
    const depthMap = new Map<string, number>([[fromSymbolId, 0]]);

    // BFS 队列
    const queue: string[] = [fromSymbolId];

    let reached = false;

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentDepth = depthMap.get(currentId) || 0;

      if (currentId === toSymbolId) {
        reached = true;
        break;
      }

      if (currentDepth >= maxDepth) {
        continue;
      }

      // 获取所有出边
      const outEdgeKeys = graph.outEdges(currentId);

      // 按目标节点组织出边，以便在两个节点间存在多条边时选取最优边
      const edgesByTarget = new Map<string, RelationEdge[]>();
      for (const edgeKey of outEdgeKeys) {
        const edge = this.graphManager.getEdge(edgeKey);
        if (!edge) continue;

        if (allowedKinds && !allowedKinds.has(edge.kind)) {
          continue;
        }

        const targetId = graph.target(edgeKey);
        let list = edgesByTarget.get(targetId);
        if (!list) {
          list = [];
          edgesByTarget.set(targetId, list);
        }
        list.push(edge);
      }

      // 遍历所有可达的目标邻居
      for (const [targetId, edges] of edgesByTarget.entries()) {
        if (!visited.has(targetId)) {
          visited.add(targetId);
          depthMap.set(targetId, currentDepth + 1);

          // 选取最佳边（若有多条则优先 calls 关系）
          const bestEdge = this.selectBestEdge(edges, options.preferCalls ?? true);
          cameFrom.set(targetId, { prevId: currentId, edge: bestEdge });

          if (targetId === toSymbolId) {
            reached = true;
            break;
          }

          queue.push(targetId);
        }
      }

      if (reached) break;
    }

    if (!reached) {
      return this.createFailureResult(`未找到从 "${fromSymbolId}" 到 "${toSymbolId}" 的调用链路`);
    }

    return this.reconstructPath(fromSymbolId, toSymbolId, cameFrom);
  }

  /**
   * 基于 Dijkstra 算法的带权最优链路寻路
   */
  private searchDijkstra(
    fromSymbolId: string,
    toSymbolId: string,
    options: PathFinderOptions
  ): PathResult {
    const maxDepth = options.maxDepth ?? 50;
    const allowedKinds = options.edgeKinds ? new Set(options.edgeKinds) : null;
    const weights: Record<EdgeKind, number> = {
      ...DEFAULT_WEIGHTS,
      ...(options.weights || {})
    };
    const graph = this.graphManager.getGraph();

    // 记录到各节点的最短距离 (代价)
    const dist = new Map<string, number>([[fromSymbolId, 0]]);
    const depthMap = new Map<string, number>([[fromSymbolId, 0]]);
    const cameFrom = new Map<string, { prevId: string; edge: RelationEdge }>();

    // 优先队列元素 [nodeId, cost]
    const openSet: Array<{ nodeId: string; cost: number }> = [
      { nodeId: fromSymbolId, cost: 0 }
    ];

    const visited = new Set<string>();
    let reached = false;

    while (openSet.length > 0) {
      // 弹出当前代价最小的节点
      openSet.sort((a, b) => a.cost - b.cost);
      const { nodeId: currentId, cost: currentCost } = openSet.shift()!;

      if (visited.has(currentId)) continue;
      visited.add(currentId);

      if (currentId === toSymbolId) {
        reached = true;
        break;
      }

      const currentDepth = depthMap.get(currentId) || 0;
      if (currentDepth >= maxDepth) continue;

      const outEdgeKeys = graph.outEdges(currentId);
      for (const edgeKey of outEdgeKeys) {
        const edge = this.graphManager.getEdge(edgeKey);
        if (!edge) continue;

        if (allowedKinds && !allowedKinds.has(edge.kind)) {
          continue;
        }

        const targetId = graph.target(edgeKey);
        if (visited.has(targetId)) continue;

        const edgeWeight = weights[edge.kind] ?? 1.0;
        const newCost = currentCost + edgeWeight;
        const currentTargetDist = dist.get(targetId);

        if (currentTargetDist === undefined || newCost < currentTargetDist) {
          dist.set(targetId, newCost);
          depthMap.set(targetId, currentDepth + 1);
          cameFrom.set(targetId, { prevId: currentId, edge });
          openSet.push({ nodeId: targetId, cost: newCost });
        }
      }
    }

    if (!reached) {
      return this.createFailureResult(`未找到从 "${fromSymbolId}" 到 "${toSymbolId}" 的最优调用链路`);
    }

    const result = this.reconstructPath(fromSymbolId, toSymbolId, cameFrom);
    result.totalCost = dist.get(toSymbolId);
    return result;
  }

  /**
   * 从终点回溯构建完整有序的节点和边链表
   */
  private reconstructPath(
    fromSymbolId: string,
    toSymbolId: string,
    cameFrom: Map<string, { prevId: string; edge: RelationEdge }>
  ): PathResult {
    const nodes: SymbolNode[] = [];
    const edges: RelationEdge[] = [];

    let currId = toSymbolId;
    while (currId !== fromSymbolId) {
      const node = this.graphManager.getNode(currId);
      if (node) {
        nodes.unshift(node);
      }

      const step = cameFrom.get(currId);
      if (!step) {
        break;
      }
      edges.unshift(step.edge);
      currId = step.prevId;
    }

    const startNode = this.graphManager.getNode(fromSymbolId);
    if (startNode) {
      nodes.unshift(startNode);
    }

    return {
      found: true,
      nodes,
      edges,
      nodeIds: nodes.map(n => n.id),
      edgeIds: edges.map(e => e.id),
      totalHops: edges.length,
      message: `成功查找到长度为 ${edges.length} 跳的调用链路`
    };
  }

  /**
   * 在多条候选边中选择最佳关系边 (优先 calls > instantiates > inherits > contains)
   */
  private selectBestEdge(edges: RelationEdge[], preferCalls: boolean): RelationEdge {
    if (edges.length === 1) return edges[0];

    if (preferCalls) {
      const callEdge = edges.find(e => e.kind === 'calls');
      if (callEdge) return callEdge;

      const instEdge = edges.find(e => e.kind === 'instantiates');
      if (instEdge) return instEdge;

      const inheritEdge = edges.find(e => e.kind === 'inherits');
      if (inheritEdge) return inheritEdge;
    }

    return edges[0];
  }

  private createFailureResult(message: string): PathResult {
    return {
      found: false,
      nodes: [],
      edges: [],
      nodeIds: [],
      edgeIds: [],
      totalHops: 0,
      message
    };
  }
}
