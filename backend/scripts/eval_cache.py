import os
import sys
import numpy as np

# Add backend directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')))

from app.rag.embedder import embed_texts

def cosine_similarity(v1, v2):
    return np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))

print('Loading model and warming up...')
embed_texts(['test'])

pairs = [
    ('How do I reset my password?', 'What is the procedure to reset my password?'),
    ('Tell me about the AetherRAG architecture.', 'Explain the architecture of AetherRAG.'),
    ('How do I reset my password?', 'How do I reset my router?'),
    ('What is the capital of France?', 'What is the capital of Germany?'),
    ('Delete my user account.', 'Create a new user account.'),
    ('Send money to John.', 'Request money from John.'),
    ('The system is currently online.', 'The system is currently offline.')
]

print('\n--- CACHE EVALUATION (Threshold = 0.95) ---')
for p1, p2 in pairs:
    v1 = embed_texts([p1])[0]
    v2 = embed_texts([p2])[0]
    sim = cosine_similarity(v1, v2)
    print(f'Similarity: {sim:.4f} | {p1} <--> {p2}')
