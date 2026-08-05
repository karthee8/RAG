import time
import os
import sys

# Add backend directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')))

from app.rag.generator import _generate_ollama, _generate_openrouter

# Mock context for generation
context = "AetherRAG is a local-first RAG architecture that uses dual-tier caching."
queries = [
    "What is AetherRAG?",
    "How does the caching work?",
    "Explain the local-first topology."
]

print("--- HARDWARE-TIERED DEGRADATION BENCHMARK ---")
print("Simulating Tier 1 (Ollama Local Inference)...")

for q in queries:
    start = time.time()
    try:
        # We simulate hitting the local Ollama instance (qwen3.5:4b)
        response = _generate_ollama(q, context)
        latency = time.time() - start
        print(f"[Ollama] Latency: {latency:.2f}s | Response length: {len(response)}")
    except Exception as e:
        print(f"[Ollama] Offline or failed: {str(e)}")

print("\nSimulating Tier 3 (OpenRouter Cloud Fallback)...")
for q in queries:
    start = time.time()
    try:
        response = _generate_openrouter(q, context)
        latency = time.time() - start
        print(f"[OpenRouter] Latency: {latency:.2f}s | Response length: {len(response)}")
    except Exception as e:
        print(f"[OpenRouter] Fallback failed: {str(e)}")
