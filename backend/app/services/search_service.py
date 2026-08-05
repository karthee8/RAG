import structlog
from duckduckgo_search import DDGS

logger = structlog.get_logger()

def search_web(query: str, max_results: int = 3) -> list[dict]:
    """
    Perform a web search using DuckDuckGo.
    Returns a list of dictionaries with 'title', 'href', and 'body'.
    """
    try:
        results = DDGS().text(query, max_results=max_results)
        return results if results else []
    except Exception as e:
        logger.error("Web search failed", query=query, error=str(e))
        return []
