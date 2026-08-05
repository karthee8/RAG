import os
import edge_tts
import uuid
import structlog
from app.rag.generator import generate

logger = structlog.get_logger()

async def generate_podcast_briefing(text: str, output_dir: str) -> str:
    """
    Takes document text, generates a short podcast script using the LLM,
    and then generates an mp3 file using edge-tts.
    Returns the absolute path to the generated mp3 file.
    """
    try:
        logger.info("Generating podcast script from text...")
        
        # Summarize for TTS
        prompt = (
            "You are a professional podcast host. Read the following document and write a 2-minute "
            "monologue summarizing its key points in an engaging, conversational tone. "
            "Do not include sound effects, multiple speakers, or stage directions. "
            "Just write the spoken text directly.\n\n"
            f"Document:\n{text[:10000]}" # Limiting text for local LLM speed
        )
        
        # We use standard generation
        script = generate(prompt, [], [], model=None)
        
        if not script or script.startswith("Error"):
            script = "I am sorry, but I was unable to generate a summary for this document at this time."
            
        logger.info("Script generated, starting TTS synthesis...")
        
        os.makedirs(output_dir, exist_ok=True)
        filename = f"briefing_{uuid.uuid4().hex[:8]}.mp3"
        output_path = os.path.join(output_dir, filename)
        
        communicate = edge_tts.Communicate(script, "en-US-ChristopherNeural")
        await communicate.save(output_path)
        
        logger.info("Podcast briefing generated", path=output_path)
        return output_path
        
    except Exception as e:
        logger.error("Failed to generate podcast briefing", error=str(e))
        raise
