def url_grounding(query: str, retrieved_chunks: list) -> list:
    import re
    from app.schemas.document import RetrievedChunk, ChunkMetadata
    from app.rag.extractor import extract_youtube, extract_webpage
    
    url_pattern = re.compile(r'https?://[^\s]+')
    urls = url_pattern.findall(query)
    
    new_chunks = []
    for i, url in enumerate(urls):
        success = False
        text = ""
        if "youtube.com" in url or "youtu.be" in url:
            text, success = extract_youtube(url)
        else:
            text, success = extract_webpage(url)
            
        if success and text:
            new_chunks.append(RetrievedChunk(
                chunk_id=f"url_{i}",
                text=text,
                metadata=ChunkMetadata(
                    source=url,
                    page=1,
                    chunk_index=i,
                    document_id="url_grounding"
                ),
                score=1.0 # Max score for explicit URL inclusion
            ))
            
    if new_chunks:
        return new_chunks + retrieved_chunks
    return retrieved_chunks

def fallback_to_web_search(query: str, retrieved_chunks: list) -> list:
    from app.services.search_service import search_web
    from app.schemas.document import RetrievedChunk, ChunkMetadata
    
    # Simple heuristic: if no chunks or top chunk has very low score (assuming cosine similarity < 0.3)
    # BM25 scores can be higher, but we'll just check if empty for now, or if explicitly requested.
    # Skip web search for very short conversational queries (< 4 words)
    is_short_query = len(query.split()) < 4
    if not is_short_query and (not retrieved_chunks or (retrieved_chunks and retrieved_chunks[0].score < 0.3)):
        web_results = search_web(query)
        if web_results:
            # Prepend web results as mock chunks
            web_chunks = []
            for i, res in enumerate(web_results):
                web_chunks.append(RetrievedChunk(
                    chunk_id=f"web_{i}",
                    text=f"Title: {res.get('title')}\nContent: {res.get('body')}",
                    metadata=ChunkMetadata(
                        source=res.get("href", "Web Search"),
                        page=1,
                        chunk_index=i,
                        document_id="web"
                    ),
                    score=1.0 # High score for web result
                ))
            return web_chunks + retrieved_chunks
    return retrieved_chunks
