import os
import json
from app.core.config import settings

RULES_FILE = os.path.join(settings.UPLOAD_DIR, "rules.json")

def get_skills() -> str:
    """Reads saved skills/rules and returns them as a formatted string."""
    if not os.path.exists(RULES_FILE):
        return ""
    
    try:
        with open(RULES_FILE, "r", encoding="utf-8") as f:
            rules = json.load(f)
            if not rules:
                return ""
            return "\n".join([f"- {r}" for r in rules])
    except Exception:
        return ""

def save_skill(rule: str) -> None:
    """Appends a new rule to the rules.json file."""
    rules = []
    if os.path.exists(RULES_FILE):
        try:
            with open(RULES_FILE, "r", encoding="utf-8") as f:
                rules = json.load(f)
        except Exception:
            pass
            
    if rule not in rules:
        rules.append(rule)
        
    os.makedirs(os.path.dirname(RULES_FILE), exist_ok=True)
    with open(RULES_FILE, "w", encoding="utf-8") as f:
        json.dump(rules, f, indent=2)
