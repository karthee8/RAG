"""
Retrieval Evaluation Script

This script evaluates the effectiveness of the RAG retrieval pipeline by computing
Hit Rate (Recall@K) and Mean Reciprocal Rank (MRR) using a small golden dataset.
"""

import asyncio
from app.rag.retriever import RAGRetriever

# Golden Dataset: (Query -> Expected Chunk Content Substring)
GOLDEN_DATASET = [
    {
        "query": "What is the capital of France?",
        "expected_content": "Paris is the capital",
        "user_id": "eval_user_1",
    },
    {
        "query": "How does the cache work?",
        "expected_content": "Redis is used for caching",
        "user_id": "eval_user_1",
    }
]

async def evaluate_retrieval():
    print("Starting Retrieval Evaluation...")
    retriever = RAGRetriever()
    
    # Normally we would ingest these chunks into LanceDB for eval_user_1 first.
    # For now, this acts as a framework to run offline evaluations.
    
    hits = 0
    mrr_sum = 0
    k = 3

    for item in GOLDEN_DATASET:
        query = item["query"]
        expected = item["expected_content"]
        user_id = item["user_id"]
        
        try:
            results = await asyncio.to_thread(retriever.search, query, user_id=user_id, top_k=k)
            
            rank = 0
            for idx, doc in enumerate(results, 1):
                if expected.lower() in doc["text"].lower():
                    rank = idx
                    break
            
            if rank > 0:
                hits += 1
                mrr_sum += 1 / rank
                print(f"[PASS] Query: '{query}' | Found at rank {rank}")
            else:
                print(f"[FAIL] Query: '{query}' | Expected content not found in top {k}")
                
        except Exception as e:
            # Table might not exist if empty
            print(f"[ERROR] Query: '{query}' | {e}")
            
    total = len(GOLDEN_DATASET)
    print("\n--- Evaluation Results ---")
    print(f"Total Queries: {total}")
    print(f"Hit Rate (Recall@{k}): {hits / total * 100:.2f}%")
    print(f"MRR: {mrr_sum / total:.2f}")

if __name__ == "__main__":
    asyncio.run(evaluate_retrieval())
