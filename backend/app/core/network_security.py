import socket
import ipaddress
import structlog
from urllib.parse import urlparse

logger = structlog.get_logger()

def validate_safe_url(url: str) -> bool:
    """
    Validates a URL to prevent Server-Side Request Forgery (SSRF).
    Checks that the URL scheme is http/https and that the resolved IP address
    is a public IP (not private, loopback, link-local, or multicast).
    """
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            logger.warning("SSRF blocked: Invalid URL scheme", url=url, scheme=parsed.scheme)
            return False
            
        hostname = parsed.hostname
        if not hostname:
            logger.warning("SSRF blocked: No hostname found in URL", url=url)
            return False
            
        # Resolve hostname to IP
        try:
            ip_str = socket.gethostbyname(hostname)
        except socket.gaierror:
            logger.warning("SSRF blocked: Hostname resolution failed", url=url, hostname=hostname)
            return False
            
        ip_obj = ipaddress.ip_address(ip_str)
        
        # Check against dangerous ranges
        if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_multicast:
            logger.warning(
                "SSRF blocked: URL resolves to restricted IP range", 
                url=url, 
                ip=ip_str,
                is_private=ip_obj.is_private,
                is_loopback=ip_obj.is_loopback
            )
            return False
            
        return True
    except Exception as e:
        logger.error("SSRF validation encountered an error", url=url, error=str(e))
        return False
