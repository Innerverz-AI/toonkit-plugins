#!/usr/bin/env python3
"""Check the shared plugin release or build a reproducible, local-only archive."""
import argparse
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / 'plugins/toonkit'
SEMVER = r'(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?'


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def plugin_files():
    files = []
    for path in sorted(PLUGIN.rglob('*')):
        require(not path.is_symlink(), 'Plugin symlinks are not portable: ' + str(path))
        if not path.is_file():
            continue
        rel = path.relative_to(PLUGIN)
        if '__pycache__' in rel.parts or path.suffix == '.pyc' or path.name == '.DS_Store':
            continue
        require(rel.parts[0] in {'.codex-plugin', '.claude-plugin', 'skills'},
                'Unexpected plugin content: ' + str(rel))
        require(path.suffix in {'.md', '.py', '.js', '.mjs', '.json', '.yaml'},
                'Review new packaged file type: ' + str(rel))
        files.append(path)
    return files


def check(tag=None):
    codex = read_json(PLUGIN / '.codex-plugin/plugin.json')
    claude = read_json(PLUGIN / '.claude-plugin/plugin.json')
    version = codex.get('version', '')
    require(re.fullmatch(SEMVER, version), 'A release SemVer is required (no local cachebuster)')
    if '-' in version:
        require(all(part and not (part.isdigit() and len(part) > 1 and part[0] == '0')
                    for part in version.split('-', 1)[1].split('.')), 'Invalid SemVer prerelease')
    require(claude.get('version') == version, 'Codex/Claude versions differ')
    require(tag is None or tag == 'v' + version, 'Tag must match both manifest versions')
    for field in ('name', 'description', 'author', 'homepage', 'repository', 'license', 'mcpServers'):
        require(codex.get(field) == claude.get(field), 'Shared manifest field differs: ' + field)
    require(codex['name'] == 'toonkit' and codex.get('skills') == './skills/', 'Plugin identity/skill path changed')
    require(codex['mcpServers'] == {'toonkit': {'type': 'http', 'url': 'https://toonkit.io/mcp'}},
            'Production MCP endpoint/auth configuration changed; review explicitly')
    cmarket = read_json(ROOT / '.agents/plugins/marketplace.json')
    amarket = read_json(ROOT / '.claude-plugin/marketplace.json')
    for market in (cmarket, amarket):
        require(market.get('name') == 'toonkit', 'Marketplace identity changed')
        require(len(market.get('plugins', [])) == 1, 'Review changed marketplace entries')
        entry = market['plugins'][0]
        require(entry.get('name') == 'toonkit', 'Marketplace/plugin identity mismatch')
        require('version' not in entry, 'Version belongs in both plugin manifests, not duplicated in catalogs')
    require(cmarket['plugins'][0]['source'] == {'source': 'local', 'path': './plugins/toonkit'},
            'Codex marketplace no longer resolves the shared plugin')
    require(amarket['plugins'][0]['source'] == './plugins/toonkit',
            'Claude marketplace no longer resolves the shared plugin')
    require(re.search(r'^## ' + re.escape(version) + r'(?:\s|$)',
                      (ROOT / 'CHANGELOG.md').read_text(encoding='utf-8'), re.M), 'Missing version changelog')
    require({p.name for p in (PLUGIN / 'skills').iterdir() if p.is_dir()} ==
            {'3dref', 'toonkit-project-manager'}, 'Shared skill set changed')
    files = plugin_files()
    for path in files:
        text = path.read_text(encoding='utf-8')
        require(not re.search(r'/Users/|/home/|Documents/Codex|https://toonkit\.io/en/animations/[0-9A-Z]{26}', text),
                'Local environment/project reference in ' + str(path.relative_to(ROOT)))
    documents = [ROOT / 'README.md', ROOT / 'README.ko.md', ROOT / 'CONTRIBUTING.md',
                 ROOT / 'validation/README.md'] + [p for p in files if p.suffix == '.md']
    for path in documents:
        text = re.sub(r'```.*?```|`[^`]*`', '', path.read_text(encoding='utf-8'), flags=re.S)
        for target in re.findall(r'\]\(([^)]+)\)', text):
            if '://' in target or target.startswith(('#', 'mailto:')):
                continue
            require((path.parent / target.split('#')[0]).is_file(),
                    'Broken document link: ' + str(path.relative_to(ROOT)) + ' -> ' + target)
    return {'version': version, 'pluginFiles': len(files), 'sharedSkills': 2,
            'marketplaces': ['codex', 'claude'], 'tag': tag}


def build(out):
    result = check()
    out = out.resolve()
    require(PLUGIN not in out.parents and out != PLUGIN, 'Build outside the installed plugin')
    out.mkdir(parents=True, exist_ok=True)
    entries = {str(p.relative_to(ROOT)): p.read_bytes() for p in plugin_files()}
    for relative in ['.agents/plugins/marketplace.json', '.claude-plugin/marketplace.json',
                     'LICENSE', 'README.md', 'README.ko.md', 'CHANGELOG.md', 'CONTRIBUTING.md']:
        entries[relative] = (ROOT / relative).read_bytes()
    # Include only development sources, never arbitrary test logs or compiled runs.
    patterns = ['scripts/*.py', 'validation/README.md', 'validation/run.py',
                'validation/tests/*.py', 'validation/tests/*.mjs',
                'validation/fixtures/*.json', '.github/workflows/*.yml']
    for pattern in patterns:
        for path in sorted(ROOT.glob(pattern)):
            require(not path.is_symlink(), 'Source archive cannot include symlinks')
            require(path == Path(__file__).resolve() or not re.search(r'/Users/|/home/|Documents/Codex|https://toonkit\.io/en/animations/[0-9A-Z]{26}', path.read_text(encoding='utf-8')), 'Local data in development source')
            entries[str(path.relative_to(ROOT))] = path.read_bytes()
    manifest = {'name': 'toonkit', 'version': result['version'], 'files': {
        name: hashlib.sha256(data).hexdigest() for name, data in sorted(entries.items())}}
    entries['RELEASE-MANIFEST.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    archive = out / ('toonkit-' + result['version'] + '.zip')
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in sorted(entries.items()):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            z.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (out / 'SHA256SUMS').write_text(digest + '  ' + archive.name + '\n', encoding='utf-8')
    return {**result, 'archive': str(archive), 'sha256': digest,
            'bytes': archive.stat().st_size, 'archiveEntries': len(entries)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    verify = sub.add_parser('check')
    verify.add_argument('--tag')
    package = sub.add_parser('build')
    package.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = check(args.tag) if args.command == 'check' else build(args.out)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as error:
        print('Release check: ' + str(error), file=sys.stderr)
        sys.exit(1)
