"""Add versioned CRM chat entry assets to an already qualified static release."""
import argparse
import hashlib
import json
from pathlib import Path


def patch_html(html, css, js):
    if html.count('</head>') != 1 or html.count('</body>') != 1:
        raise ValueError('Expected one complete HTML page')
    if 'data-clinic-assistant-entry' in html:
        raise ValueError('Assistant entry already installed')
    return html.replace('</head>', f'<link data-clinic-assistant-entry rel="stylesheet" href="{css}" /></head>').replace('</body>', f'<script data-clinic-assistant-entry defer src="{js}"></script></body>')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('release', type=Path)
    parser.add_argument('assets', type=Path)
    args = parser.parse_args()
    root = args.release.resolve()
    if not root.is_dir() or not (root / 'index.html').is_file():
        raise ValueError('Complete staged release required')
    files = {}
    for ext in ['css', 'js']:
        body = (args.assets / f'assistant-entry.{ext}').read_bytes()
        digest = hashlib.sha256(body).hexdigest()[:16]
        relative = f'assets/assistant-entry-{digest}.{ext}'
        target = root / relative
        if target.exists():
            raise ValueError('Versioned asset already exists')
        files[ext] = (relative, body)
    pages = sorted(root.rglob('*.html'))
    # Validate every page before editing any staged page.
    patched = [(p, patch_html(p.read_text(), '/' + files['css'][0], '/' + files['js'][0])) for p in pages]
    for relative, body in files.values():
        (root / relative).write_bytes(body)
        (root / relative).chmod(0o644)
    for page, html in patched:
        page.write_text(html)
    manifest = {'pages': len(patched), 'css': '/' + files['css'][0], 'js': '/' + files['js'][0]}
    (root / 'assistant-entry-release.json').write_text(json.dumps(manifest) + '\n')
    print(json.dumps(manifest))


if __name__ == '__main__':
    main()
