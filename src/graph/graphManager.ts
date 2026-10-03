/**
 * GraphManager - 多关系有向图管理核心
 * 基于 graphology 的 MultiDirectedGraph 封装，管理代码实体符号节点与多重关联边
 */

import { MultiDirectedGraph } from 'graphology';
import {
  SymbolNode,
  RelationEdge,
  EgoGraphData,
  EgoNeighbor,
  EdgeKind,
  ClassNode,
  FunctionNode
} from '../types';

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  functionCount: number;
  classCount: number;
}

export interface GraphNodeAttributes {
  symbol: SymbolNode;
}

export interface GraphEdgeAttributes {
  relation: RelationEdge;
  key: string;
}

export class GraphManager {
  private graph: MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>;
  
  // 维护 filePath -> Set<symbolId> 的映射，以支持高效的单文件增量更新与删除
  private fileToNodeIds: Map<string, Set<string>> = new Map();
  
  // 维护 filePath -> Set<edgeKey> 的映射（基于边的源节点所在文件路径）
  private fileToEdgeKeys: Map<string, Set<string>> = new Map();

  // 维护内部 edgeKey -> RelationEdge 的完整映射
  private edgeKeyToRelation: Map<string, RelationEdge> = new Map();

  // 维护 edge.id (如 a->[calls]->b) 到实际分配的 edgeKey 集合的映射（支持同两节点间多重调用点）
  private edgeIdToKeys: Map<string, Set<string>> = new Map();

  constructor() {
    this.graph = new MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>();
  }

  /**
   * 生成内部唯一的 Edge Key
   * 若边包含 callSite 信息，则拼接调用行号与列号；否则使用 edge.id
   */
  public generateEdgeKey(edge: RelationEdge): string {
    if (edge.callSite) {
      return `${edge.id}@${edge.callSite.line}:${edge.callSite.column}`;
    }
    return edge.id;
  }

  // ==========================================
  // 节点操作 (Node Operations)
  // ==========================================

  /**
   * 添加单个节点 (别名)
   */
  public addNode(node: SymbolNode): void {
    this.addOrUpdateNode(node);
  }

  /**
   * 添加或更新单个节点
   */
  public addOrUpdateNode(node: SymbolNode): void {
    const symbolId = node.id;
    if (this.graph.hasNode(symbolId)) {
      // 节点已存在，更新其属性
      this.graph.setNodeAttribute(symbolId, 'symbol', node);
    } else {
      // 节点不存在，新增节点
      this.graph.addNode(symbolId, { symbol: node });
    }

    // 更新文件与节点的归属映射
    if (node.filePath) {
      let fileNodes = this.fileToNodeIds.get(node.filePath);
      if (!fileNodes) {
        fileNodes = new Set();
        this.fileToNodeIds.set(node.filePath, fileNodes);
      }
      fileNodes.add(symbolId);
    }
  }

  /**
   * 批量添加或更新节点
   */
  public addNodes(nodes: SymbolNode[]): void {
    for (const node of nodes) {
      this.addOrUpdateNode(node);
    }
  }

  /**
   * 获取指定 ID 的节点
   */
  public getNode(symbolId: string): SymbolNode | undefined {
    if (!this.graph.hasNode(symbolId)) {
      return undefined;
    }
    return this.graph.getNodeAttribute(symbolId, 'symbol');
  }

  /**
   * 检查节点是否存在
   */
  public hasNode(symbolId: string): boolean {
    return this.graph.hasNode(symbolId);
  }

  /**
   * 删除指定节点及其级联关联的边
   */
  public removeNode(symbolId: string): boolean {
    if (!this.graph.hasNode(symbolId)) {
      return false;
    }

    const node = this.getNode(symbolId);
    if (node && node.filePath) {
      const fileNodes = this.fileToNodeIds.get(node.filePath);
      if (fileNodes) {
        fileNodes.delete(symbolId);
        if (fileNodes.size === 0) {
          this.fileToNodeIds.delete(node.filePath);
        }
      }
    }

    // graphology 在 dropNode 时会自动删除所有相连的边
    // 我们需要在 dropNode 之前同步清理内部 edgeKey 映射
    const inEdges = this.graph.inEdges(symbolId);
    const outEdges = this.graph.outEdges(symbolId);
    const connectedEdgeKeys = new Set([...inEdges, ...outEdges]);

    for (const edgeKey of connectedEdgeKeys) {
      this.cleanupEdgeKeyMaps(edgeKey);
    }

    this.graph.dropNode(symbolId);
    return true;
  }

  /**
   * 获取图谱中的全部节点
   */
  public getAllNodes(): SymbolNode[] {
    const nodes: SymbolNode[] = [];
    this.graph.forEachNode((_, attributes) => {
      if (attributes.symbol) {
        nodes.push(attributes.symbol);
      }
    });
    return nodes;
  }

  // ==========================================
  // 边操作 (Edge Operations)
  // ==========================================

  /**
   * 添加单条边 (别名)
   */
  public addEdge(edge: RelationEdge): boolean {
    return this.addOrUpdateEdge(edge);
  }

  /**
   * 添加或更新单条边
   * 如果 source 或 target 不存在，返回 false 避免抛出异常
   */
  public addOrUpdateEdge(edge: RelationEdge): boolean {
    if (!this.graph.hasNode(edge.source) || !this.graph.hasNode(edge.target)) {
      return false;
    }

    let edgeKey = this.generateEdgeKey(edge);

    // 如果未附带 callSite，但 edgeKey 已被其他不同边占用，做自增去重处理
    if (this.graph.hasEdge(edgeKey)) {
      const existing = this.edgeKeyToRelation.get(edgeKey);
      if (existing && (existing.source !== edge.source || existing.target !== edge.target || existing.kind !== edge.kind)) {
        let suffix = 1;
        while (this.graph.hasEdge(`${edgeKey}#${suffix}`)) {
          suffix++;
        }
        edgeKey = `${edgeKey}#${suffix}`;
      }
    }

    if (this.graph.hasEdge(edgeKey)) {
      this.graph.setEdgeAttribute(edgeKey, 'relation', edge);
      this.graph.setEdgeAttribute(edgeKey, 'key', edgeKey);
    } else {
      this.graph.addEdgeWithKey(edgeKey, edge.source, edge.target, {
        relation: edge,
        key: edgeKey
      });
    }

    // 登记映射
    this.edgeKeyToRelation.set(edgeKey, edge);

    let keySet = this.edgeIdToKeys.get(edge.id);
    if (!keySet) {
      keySet = new Set();
      this.edgeIdToKeys.set(edge.id, keySet);
    }
    keySet.add(edgeKey);

    // 记录文件归属 (按 source 节点所在文件)
    const sourceNode = this.getNode(edge.source);
    if (sourceNode && sourceNode.filePath) {
      let fileEdges = this.fileToEdgeKeys.get(sourceNode.filePath);
      if (!fileEdges) {
        fileEdges = new Set();
        this.fileToEdgeKeys.set(sourceNode.filePath, fileEdges);
      }
      fileEdges.add(edgeKey);
    }

    return true;
  }

  /**
   * 批量添加边
   */
  public addEdges(edges: RelationEdge[]): void {
    for (const edge of edges) {
      this.addOrUpdateEdge(edge);
    }
  }

  /**
   * 获取指定 edgeKey 或 edgeId 的关系边
   */
  public getEdge(edgeKeyOrId: string): RelationEdge | undefined {
    if (this.edgeKeyToRelation.has(edgeKeyOrId)) {
      return this.edgeKeyToRelation.get(edgeKeyOrId);
    }
    const keys = this.edgeIdToKeys.get(edgeKeyOrId);
    if (keys && keys.size > 0) {
      const firstKey = keys.values().next().value;
      if (firstKey) {
        return this.edgeKeyToRelation.get(firstKey);
      }
    }
    return undefined;
  }

  /**
   * 检查边是否存在
   */
  public hasEdge(edgeKeyOrId: string): boolean {
    if (this.graph.hasEdge(edgeKeyOrId)) {
      return true;
    }
    const keys = this.edgeIdToKeys.get(edgeKeyOrId);
    return !!(keys && keys.size > 0);
  }

  /**
   * 删除边
   */
  public removeEdge(edgeKeyOrId: string): boolean {
    let edgeKey = edgeKeyOrId;
    if (!this.graph.hasEdge(edgeKey)) {
      const keys = this.edgeIdToKeys.get(edgeKeyOrId);
      if (keys && keys.size > 0) {
        edgeKey = keys.values().next().value!;
      } else {
        return false;
      }
    }

    this.cleanupEdgeKeyMaps(edgeKey);
    this.graph.dropEdge(edgeKey);
    return true;
  }

  /**
   * 获取全部关系边
   */
  public getAllEdges(): RelationEdge[] {
    return Array.from(this.edgeKeyToRelation.values());
  }

  private cleanupEdgeKeyMaps(edgeKey: string): void {
    const edge = this.edgeKeyToRelation.get(edgeKey);
    if (edge) {
      const keys = this.edgeIdToKeys.get(edge.id);
      if (keys) {
        keys.delete(edgeKey);
        if (keys.size === 0) {
          this.edgeIdToKeys.delete(edge.id);
        }
      }
      this.edgeKeyToRelation.delete(edgeKey);
    }

    // 清理 fileToEdgeKeys 中的记录
    for (const [filePath, edgeKeys] of this.fileToEdgeKeys.entries()) {
      if (edgeKeys.has(edgeKey)) {
        edgeKeys.delete(edgeKey);
        if (edgeKeys.size === 0) {
          this.fileToEdgeKeys.delete(filePath);
        }
        break;
      }
    }
  }

  // ==========================================
  // 文件级别与工作区级别增量同步
  // ==========================================

  /**
   * 增量更新单个文件的节点与关联边
   * 1. 对比并移除已在该文件中删除的节点
   * 2. 更新或新增该文件的新节点
   * 3. 移除该文件发出的旧边，写入新边
   */
  public updateFile(filePath: string, nodes: SymbolNode[], edges: RelationEdge[]): void {
    const existingNodeIds = this.fileToNodeIds.get(filePath) || new Set<string>();
    const newNodeIdSet = new Set(nodes.map(n => n.id));

    // 删除不在新结果中的旧节点
    for (const oldId of existingNodeIds) {
      if (!newNodeIdSet.has(oldId)) {
        this.removeNode(oldId);
      }
    }

    // 添加或更新新节点
    for (const node of nodes) {
      this.addOrUpdateNode(node);
    }

    // 移除原有由该文件发出的旧边
    const oldEdgeKeys = this.fileToEdgeKeys.get(filePath);
    if (oldEdgeKeys) {
      const edgeKeysCopy = Array.from(oldEdgeKeys);
      for (const edgeKey of edgeKeysCopy) {
        this.removeEdge(edgeKey);
      }
    }

    // 写入新边
    for (const edge of edges) {
      this.addOrUpdateEdge(edge);
    }
  }

  /**
   * 删除某个文件的全部节点与发出边
   */
  public removeFile(filePath: string): void {
    const nodeIds = this.fileToNodeIds.get(filePath);
    if (nodeIds) {
      const nodeIdsCopy = Array.from(nodeIds);
      for (const symbolId of nodeIdsCopy) {
        this.removeNode(symbolId);
      }
    }
    this.fileToNodeIds.delete(filePath);
    this.fileToEdgeKeys.delete(filePath);
  }

  /**
   * 批量加载整个工作区数据
   */
  public loadWorkspace(nodes: SymbolNode[], edges: RelationEdge[]): void {
    this.clear();
    this.addNodes(nodes);
    this.addEdges(edges);
  }

  /**
   * 清空图谱及所有内部索引
   */
  public clear(): void {
    this.graph.clear();
    this.fileToNodeIds.clear();
    this.fileToEdgeKeys.clear();
    this.edgeKeyToRelation.clear();
    this.edgeIdToKeys.clear();
  }

  // ==========================================
  // FR-05 / FR-06 Ego Graph (局部聚焦图) 提取算法
  // ==========================================

  /**
   * 提取指定 symbolId 的 1 阶 Ego Graph（局部聚焦图）
   * 包含：
   * 1. 中心节点
   * 2. 1 阶前驱邻居（入度：调用者、包含者、子类、实例化者）及对应入向边
   * 3. 1 阶后继邻居（出度：被调用者、所属类、基类、类方法）及对应出向边
   * 4. 所有邻居节点之间存在的全部内部关联边 (Induced Subgraph Edges)
   * 返回满足 EgoGraphData 协议的完整拓扑结构
   */
  public getEgoGraph(symbolId: string): EgoGraphData | null {
    if (!this.graph.hasNode(symbolId)) {
      return null;
    }

    const center = this.getNode(symbolId);
    if (!center) {
      return null;
    }

    const predecessors: EgoNeighbor[] = [];
    const successors: EgoNeighbor[] = [];

    // 1. 收集 1 阶入度边 (Predecessors)
    const inEdgeKeys = this.graph.inEdges(symbolId);
    for (const edgeKey of inEdgeKeys) {
      const sourceId = this.graph.source(edgeKey);
      const sourceNode = this.getNode(sourceId);
      const relation = this.edgeKeyToRelation.get(edgeKey);
      if (sourceNode && relation) {
        predecessors.push({
          node: sourceNode,
          edge: relation
        });
      }
    }

    // 2. 收集 1 阶出度边 (Successors)
    const outEdgeKeys = this.graph.outEdges(symbolId);
    for (const edgeKey of outEdgeKeys) {
      const targetId = this.graph.target(edgeKey);
      const targetNode = this.getNode(targetId);
      const relation = this.edgeKeyToRelation.get(edgeKey);
      if (targetNode && relation) {
        successors.push({
          node: targetNode,
          edge: relation
        });
      }
    }

    // 3. 汇总 Ego Graph 包含的全部去重节点
    const egoNodeMap = new Map<string, SymbolNode>();
    egoNodeMap.set(center.id, center);

    for (const pred of predecessors) {
      egoNodeMap.set(pred.node.id, pred.node);
    }
    for (const succ of successors) {
      egoNodeMap.set(succ.node.id, succ.node);
    }

    const allNodes = Array.from(egoNodeMap.values());
    const egoNodeIdSet = new Set(egoNodeMap.keys());

    // 4. 提取 Ego 闭包子图中所有节点之间的全部内部边（包括中心与邻居、以及邻居与邻居之间的边）
    const internalEdgeMap = new Map<string, RelationEdge>();

    for (const nodeId of egoNodeIdSet) {
      const nodeOutEdgeKeys = this.graph.outEdges(nodeId);
      for (const edgeKey of nodeOutEdgeKeys) {
        const targetId = this.graph.target(edgeKey);
        // 若边的目标节点也在 Ego 节点集合内，则此边为闭包子图内部边
        if (egoNodeIdSet.has(targetId)) {
          const relation = this.edgeKeyToRelation.get(edgeKey);
          if (relation) {
            internalEdgeMap.set(edgeKey, relation);
          }
        }
      }
    }

    const allEdges = Array.from(internalEdgeMap.values());

    return {
      center,
      predecessors,
      successors,
      allNodes,
      allEdges
    };
  }

  // ==========================================
  // 全图统计指标 (Statistics)
  // ==========================================

  /**
   * 获取图谱统计指标
   * 包括：总节点数、总边数、函数数量、类数量
   */
  public getStats(): GraphStats {
    let functionCount = 0;
    let classCount = 0;

    this.graph.forEachNode((_, attributes) => {
      const symbol = attributes.symbol;
      if (symbol) {
        if (symbol.kind === 'class') {
          classCount++;
        } else {
          functionCount++;
        }
      }
    });

    return {
      totalNodes: this.graph.order,
      totalEdges: this.graph.size,
      functionCount,
      classCount
    };
  }

  // ==========================================
  // 辅助查询方法
  // ==========================================

  /**
   * 获取指定文件的全部节点
   */
  public getNodesByFile(filePath: string): SymbolNode[] {
    const nodeIds = this.fileToNodeIds.get(filePath);
    if (!nodeIds) return [];
    const result: SymbolNode[] = [];
    for (const id of nodeIds) {
      const node = this.getNode(id);
      if (node) result.push(node);
    }
    return result;
  }

  /**
   * 获取某个节点的直接入度邻居节点列表
   */
  public getInNeighbors(symbolId: string): SymbolNode[] {
    if (!this.graph.hasNode(symbolId)) return [];
    const inNeighbors = this.graph.inNeighbors(symbolId);
    return inNeighbors.map(id => this.getNode(id)!).filter(Boolean);
  }

  /**
   * 获取某个节点的直接出度邻居节点列表
   */
  public getOutNeighbors(symbolId: string): SymbolNode[] {
    if (!this.graph.hasNode(symbolId)) return [];
    const outNeighbors = this.graph.outNeighbors(symbolId);
    return outNeighbors.map(id => this.getNode(id)!).filter(Boolean);
  }

  /**
   * 获取指向指定节点的全部入向关系边
   */
  public getInEdges(symbolId: string): RelationEdge[] {
    if (!this.graph.hasNode(symbolId)) return [];
    const edgeKeys = this.graph.inEdges(symbolId);
    return edgeKeys.map(key => this.edgeKeyToRelation.get(key)!).filter(Boolean);
  }

  /**
   * 获取从指定节点指出的全部出向关系边
   */
  public getOutEdges(symbolId: string): RelationEdge[] {
    if (!this.graph.hasNode(symbolId)) return [];
    const edgeKeys = this.graph.outEdges(symbolId);
    return edgeKeys.map(key => this.edgeKeyToRelation.get(key)!).filter(Boolean);
  }

  /**
   * 获取底层的 graphology 图对象
   */
  public getGraph(): MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes> {
    return this.graph;
  }
}
