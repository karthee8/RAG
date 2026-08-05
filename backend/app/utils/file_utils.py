import os
import uuid
from app.core.config import settings

def generate_secure_filename(filename: str) -> str:
    """
    Generates a unique, path-safe filename using a UUID4 prefix.

    The original name is reduced to its basename so embedded path separators or
    ``..`` segments in a crafted upload filename cannot escape the upload
    directory (path traversal). The extension is lowercased and preserved.
    """
    # Strip any directory components from a (possibly malicious) client filename.
    base = os.path.basename(filename.replace("\\", "/"))
    name, ext = os.path.splitext(base)
    return f"{uuid.uuid4()}_{name}{ext.lower()}"

def sanitize_display_filename(filename: str) -> str:
    """
    Sanitizes a filename for safe storage and display in API responses.

    Strips directory components, removes characters that could be used for
    injection attacks (quotes, semicolons, angle brackets, etc.), and
    collapses whitespace.
    """
    import re
    base = os.path.basename(filename.replace("\\", "/"))
    # Keep only safe characters: alphanumeric, dots, hyphens, underscores, spaces
    sanitized = re.sub(r"[^\w.\- ]", "_", base)
    # Collapse consecutive hyphens (SQL comment syntax) into a single one
    sanitized = re.sub(r"-{2,}", "-", sanitized)
    # Collapse multiple underscores/spaces
    sanitized = re.sub(r"[_ ]{2,}", "_", sanitized).strip("_ ")
    return sanitized or "unnamed_file"

def validate_file_extension(filename: str) -> bool:
    """
    Validates if the file extension is in the allowed list from configurations.
    """
    allowed_exts = {ext.strip().lower() for ext in settings.ALLOWED_EXTENSIONS.split(",")}
    ext = os.path.splitext(filename)[1].lstrip(".").lower()
    return ext in allowed_exts

def validate_mime_type(content_type: str) -> bool:
    """
    Validates if the content type/MIME type is allowed.
    """
    allowed_mimes = {
        "application/pdf",
        "text/plain",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/csv",
        "text/markdown",
        "audio/mpeg",
        "audio/wav",
        "audio/mp3",
        "video/mp4",
        "video/webm",
        "video/quicktime",
        "image/png",
        "image/jpeg",
        "application/octet-stream", # Often sent by proxies/fetch when type is unknown
    }
    return content_type.lower() in allowed_mimes
