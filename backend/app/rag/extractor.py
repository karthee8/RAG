import os
import pypdf
import docx
import structlog
from app.utils.text_utils import clean_text

logger = structlog.get_logger()
_ocr_reader = None

def get_ocr_reader():
    global _ocr_reader
    if _ocr_reader is None:
        import easyocr
        import torch
        # Limit PyTorch intra-op threads so our ThreadPoolExecutor doesn't cause CPU thrashing
        torch.set_num_threads(1)
        # Initialize once to save model loading time
        _ocr_reader = easyocr.Reader(['en'], gpu=False, download_enabled=False)
    return _ocr_reader

def extract_pdf(path: str) -> tuple[str, bool]:
    """
    Extracts text from a PDF file using PyMuPDF (fitz).
    Uses EasyOCR as a fallback for scanned pages.
    """
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(path)
        text_parts = []
        
        # Fast pass: Try normal text extraction
        for page in doc:
            page_text = page.get_text().strip()
            if page_text:
                text_parts.append(page_text)
                
        # If the document has pages but no text was extracted, it's likely a scanned PDF
        if len(doc) > 0 and not text_parts:
            logger.info("No text found in PDF, falling back to OCR", path=path)
            
            reader = get_ocr_reader()
            
            for page in doc:
                # Render page to an image (dpi=72 provides smaller images for much faster CPU OCR)
                pix = page.get_pixmap(dpi=72)
                img_bytes = pix.tobytes("png")
                
                # Run OCR with batch_size > 1 to speed up recognition phase safely
                results = reader.readtext(img_bytes, detail=0, batch_size=8)
                page_text = " ".join(results)
                if page_text.strip():
                    text_parts.append(page_text)

        return "\n---PAGE_BREAK---\n".join(text_parts), True
    except Exception as e:
        logger.error("Failed to extract PDF", path=path, error=str(e))
        return "", False

def extract_docx(path: str) -> tuple[str, bool]:
    """
    Extracts text from a DOCX file using python-docx.
    """
    try:
        doc = docx.Document(path)
        text_parts = []
        for paragraph in doc.paragraphs:
            if paragraph.text:
                text_parts.append(paragraph.text)
        return "\n".join(text_parts), True
    except Exception as e:
        logger.error("Failed to extract DOCX", path=path, error=str(e))
        return "", False

def extract_txt(path: str) -> tuple[str, bool]:
    """
    Extracts text from a TXT file with UTF-8 decoding and fallback to latin-1.
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read(), True
    except UnicodeDecodeError:
        try:
            logger.warning("UTF-8 decoding failed, falling back to latin-1", path=path)
            with open(path, "r", encoding="latin-1") as f:
                return f.read(), True
        except Exception as e:
            logger.error("Failed to extract TXT with latin-1 fallback", path=path, error=str(e))
            return "", False
    except Exception as e:
        logger.error("Failed to extract TXT", path=path, error=str(e))
        return "", False

def extract_audio_video(path: str) -> tuple[str, bool]:
    """
    Extracts text from audio/video files using Whisper.
    """
    try:
        import whisper
        import torch
        logger.info("Loading Whisper model...", path=path)
        # For performance, default to the "base" model. 
        model = whisper.load_model("base", device="cuda" if torch.cuda.is_available() else "cpu")
        logger.info("Starting transcription...", path=path)
        result = model.transcribe(path)
        text = result.get("text", "").strip()
        if not text:
            return "", False
        return text, True
    except Exception as e:
        logger.error("Failed to extract audio/video with Whisper", path=path, error=str(e))
        return "", False

def extract_image(path: str) -> tuple[str, bool]:
    """
    Extracts text from images using EasyOCR.
    """
    try:
        reader = get_ocr_reader()
        logger.info("Extracting text from image...", path=path)
        results = reader.readtext(path, detail=0)
        text = " ".join(results).strip()
        if not text:
            return "", False
        return text, True
    except Exception as e:
        logger.error("Failed to extract image text", path=path, error=str(e))
        return "", False

def extract_text_from_file(path: str) -> tuple[str, bool]:
    """
    Identifies the file type and extracts clean text.
    Returns (cleaned_text, success_flag).
    """
    if not os.path.exists(path):
        logger.error("File does not exist for extraction", path=path)
        return "", False

    ext = os.path.splitext(path)[1].lower()
    
    if ext == ".pdf":
        raw_text, success = extract_pdf(path)
    elif ext == ".docx":
        raw_text, success = extract_docx(path)
    elif ext in (".txt", ".text"):
        raw_text, success = extract_txt(path)
    elif ext in (".mp4", ".mp3", ".wav", ".webm"):
        raw_text, success = extract_audio_video(path)
    elif ext in (".png", ".jpg", ".jpeg"):
        raw_text, success = extract_image(path)
    else:
        logger.error("Unsupported file extension for extraction", path=path, ext=ext)
        return "", False

    if success:
        return clean_text(raw_text), True
    
    return "", False

def extract_graph_entities(text: str) -> list[tuple[str, str, str]]:
    """
    Uses an LLM to extract (head, relation, tail) triplets from text.
    To avoid blowing up local generation limits, this should ideally be run
    on summarized chunks or bypassed entirely if the text is too large.
    For this implementation, we use a basic heuristic or a small LLM call.
    """
    try:
        from langchain_experimental.graph_transformers import LLMGraphTransformer
        from langchain_core.documents import Document
        from app.core.config import settings
        from app.rag.generator import _generate_ollama, _generate_openrouter
        
        # We need a proper chat model. We can mock it or use the provider.
        # But for safety and speed in this demo, we'll return a mock if it fails.
        # A full production implementation would instantiate a ChatOllama here.
        # Since local extraction is heavy, we'll return an empty list if not configured.
        if not settings.LLM_MODEL:
            return []
            
        # Due to context limits, we would only extract from the first 2000 chars for demo.
        # A real implementation would iterate over chunks.
        return [] # Placeholder: Full LLMGraphTransformer requires ChatModel instantiation.
    except Exception as e:
        logger.warning("Graph extraction failed, skipping.", error=str(e))
        return []

def extract_webpage(url: str) -> tuple[str, bool]:
    """
    Extracts text from a standard webpage using requests and BeautifulSoup.
    """
    try:
        import requests
        from bs4 import BeautifulSoup
        from app.core.network_security import validate_safe_url
        
        if not validate_safe_url(url):
            logger.error("SSRF Prevention: Blocked unsafe webpage URL extraction", url=url)
            return "", False
        
        logger.info("Fetching webpage...", url=url)
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, "html.parser")
        
        for script in soup(["script", "style", "nav", "footer", "header"]):
            script.decompose()
            
        text = soup.get_text(separator=" ", strip=True)
        if not text:
            return "", False
            
        return clean_text(text), True
    except Exception as e:
        logger.error("Failed to extract webpage", url=url, error=str(e))
        return "", False

def extract_youtube(url: str) -> tuple[str, bool]:
    """
    Fetches transcripts from YouTube using youtube-transcript-api.
    """
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        import urllib.parse
        from app.core.network_security import validate_safe_url
        
        if not validate_safe_url(url):
            logger.error("SSRF Prevention: Blocked unsafe YouTube URL extraction", url=url)
            return "", False
        
        logger.info("Fetching YouTube transcript...", url=url)
        
        # Extract video ID
        parsed_url = urllib.parse.urlparse(url)
        video_id = ""
        if parsed_url.hostname in ('youtu.be', 'www.youtu.be'):
            video_id = parsed_url.path[1:]
        elif parsed_url.hostname in ('youtube.com', 'www.youtube.com'):
            if parsed_url.path == '/watch':
                query = urllib.parse.parse_qs(parsed_url.query)
                video_id = query.get('v', [''])[0]
        
        if not video_id:
            logger.error("Failed to parse YouTube video ID", url=url)
            return "", False
            
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        text = " ".join([item['text'] for item in transcript_list])
        
        if not text:
            return "", False
            
        return clean_text(text), True
            
    except Exception as e:
        logger.error("Failed to extract YouTube transcript", url=url, error=str(e))
        return "", False
