import os
import json
import networkx as nx
from app.core.config import settings

class GraphStore:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(GraphStore, cls).__new__(cls, *args, **kwargs)
            cls._instance._graph = None
            cls._instance._db_path = os.path.join(settings.CHROMA_PERSIST_DIR, "knowledge_graph.graphml")
        return cls._instance

    @property
    def graph(self) -> nx.Graph:
        if self._graph is None:
            if os.path.exists(self._db_path):
                self._graph = nx.read_graphml(self._db_path)
            else:
                self._graph = nx.Graph()
        return self._graph

    def save(self):
        os.makedirs(os.path.dirname(self._db_path), exist_ok=True)
        nx.write_graphml(self.graph, self._db_path)

    def add_triplets(self, triplets: list[tuple[str, str, str]], document_id: str):
        """
        Adds (head, relation, tail) triplets to the graph.
        """
        for head, relation, tail in triplets:
            if not self.graph.has_node(head):
                self.graph.add_node(head, label=head)
            if not self.graph.has_node(tail):
                self.graph.add_node(tail, label=tail)
            
            self.graph.add_edge(head, tail, relation=relation, document_id=document_id)
        
        self.save()

    def get_subgraph_context(self, entities: list[str], max_depth: int = 2) -> str:
        """
        Retrieves a text summary of the neighborhood around the given entities.
        """
        context_lines = []
        visited_edges = set()

        for entity in entities:
            if entity not in self.graph:
                continue
            
            # Simple BFS to get neighborhood
            edges = nx.bfs_edges(self.graph, source=entity, depth_limit=max_depth)
            for u, v in edges:
                if (u, v) not in visited_edges and (v, u) not in visited_edges:
                    rel = self.graph[u][v].get('relation', 'is related to')
                    context_lines.append(f"- {u} {rel} {v}")
                    visited_edges.add((u, v))

        if not context_lines:
            return ""
        return "Knowledge Graph Context:\n" + "\n".join(context_lines)

    def delete_document(self, document_id: str):
        edges_to_remove = [
            (u, v) for u, v, d in self.graph.edges(data=True) 
            if d.get("document_id") == document_id
        ]
        self.graph.remove_edges_from(edges_to_remove)
        
        # Remove isolated nodes
        isolated = list(nx.isolates(self.graph))
        self.graph.remove_nodes_from(isolated)
        self.save()

_graph_store = GraphStore()

def add_triplets(triplets: list[tuple[str, str, str]], document_id: str):
    _graph_store.add_triplets(triplets, document_id)

def get_subgraph_context(entities: list[str]) -> str:
    return _graph_store.get_subgraph_context(entities)

def delete_document_from_graph(document_id: str):
    _graph_store.delete_document(document_id)
