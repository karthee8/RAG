# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the light StrongRAG FastAPI backend.

Run from the backend/ dir with the packaging venv:
    venv_pkg\\Scripts\\pyinstaller.exe packaging\\strongrag-backend.spec --noconfirm

Produces dist/strongrag-backend/strongrag-backend.exe (one-folder build, faster
startup and easier to bundle as an electron-builder extraResource than one-file).
"""

from PyInstaller.utils.hooks import collect_all, collect_submodules

datas = []
binaries = []
hiddenimports = []

# Packages that load data files and/or submodules dynamically — collect
# everything so the frozen exe has what it needs at runtime.
for pkg in (
    "lancedb",
    "pyarrow",
    "fastembed",
    "onnxruntime",
    "tokenizers",
    "huggingface_hub",
    "structlog",
    "passlib",
    "jose",
    "edge_tts",
    "yt_dlp",
    "duckduckgo_search",
    "easyocr",
    "networkx",
    "sqlalchemy",
    "alembic"
):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

# uvicorn picks its loop/protocol/lifespan implementations by import string at
# runtime; pull in all submodules so none are missing when frozen.
hiddenimports += collect_submodules("uvicorn")
# passlib loads bcrypt backend lazily by name.
hiddenimports += ["passlib.handlers.bcrypt", "bcrypt"]
# Our own app package (imported lazily in run_server.main).
hiddenimports += collect_submodules("app")

block_cipher = None

a = Analysis(
    ["run_server.py"],
    pathex=[".."],          # backend/ root so `import app...` resolves
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Dev/build tooling that must never enter the runtime bundle.
        "torch",
        "sentence_transformers",
        "transformers",
        "PyInstaller",
        "pip",
        "setuptools",
        "pytest",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="strongrag-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,          # keep a console so launcher can read stdout/stderr logs
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="strongrag-backend",
)
