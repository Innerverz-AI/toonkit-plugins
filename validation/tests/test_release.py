"""Exercise release failures and the relocatable archive without installing it."""
import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
loader = importlib.util.spec_from_file_location('release', ROOT / 'scripts/release.py')
release = importlib.util.module_from_spec(loader)
loader.loader.exec_module(release)


class Release(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'source'
        shutil.copytree(ROOT, self.root, ignore=shutil.ignore_patterns('.git', '__pycache__', 'node_modules', 'dist', '.cache'))
        release.ROOT = self.root
        release.PLUGIN = self.root / 'plugins/toonkit'

    def tearDown(self):
        release.ROOT = ROOT
        release.PLUGIN = ROOT / 'plugins/toonkit'
        self.temp.cleanup()

    def test_both_versions_and_tag_must_agree(self):
        version = release.check()['version']
        release.check('v' + version)
        with self.assertRaisesRegex(ValueError, 'Tag'):
            release.check('v999.0.0')
        file = release.PLUGIN / '.claude-plugin/plugin.json'
        data = json.loads(file.read_text()); data['version'] = '999.0.0'
        file.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, 'versions differ'):
            release.check()

    def test_catalog_cannot_point_to_another_plugin(self):
        file = self.root / '.claude-plugin/marketplace.json'
        data = json.loads(file.read_text()); data['plugins'][0]['source'] = '../outside'
        file.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, 'shared plugin'):
            release.check()

    def test_invalid_versions_and_cachebusters_fail(self):
        for version in ['01.2.3', '0.2.0-01', '0.2.0-a..b', '0.2.0+codex.local']:
            file = release.PLUGIN / '.codex-plugin/plugin.json'
            data = json.loads(file.read_text()); data['version'] = version
            file.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, 'SemVer'):
                release.check()

    def test_missing_referenced_document_fails(self):
        (release.PLUGIN / 'skills/3dref/references/body-motion.md').unlink()
        with self.assertRaisesRegex(ValueError, 'Broken document link'):
            release.check()

    def test_private_environment_data_is_rejected(self):
        file = release.PLUGIN / 'skills/3dref/references/private.md'
        file.write_text('/' + 'Users' + '/example/previous-scene.json')
        with self.assertRaisesRegex(ValueError, 'Local environment'):
            release.check()

    def test_runtime_cannot_embed_tests_or_external_symlinks(self):
        folder = release.PLUGIN / 'validation'; folder.mkdir()
        (folder / 'test.py').write_text('pass\n')
        with self.assertRaisesRegex(ValueError, 'Unexpected plugin content'):
            release.check()
        shutil.rmtree(folder)
        (release.PLUGIN / 'skills/3dref/external.md').symlink_to(self.root / 'LICENSE')
        with self.assertRaisesRegex(ValueError, 'symlinks'):
            release.check()

    def test_archive_is_reproducible_hashed_and_relocatable(self):
        # Use this isolated copy's own builder so source scanning sees the same root.
        def build(out):
            proc = subprocess.run([sys.executable, '-B', str(self.root / 'scripts/release.py'),
                                   'build', '--out', str(out)], capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            return json.loads(proc.stdout)
        a = build(Path(self.temp.name) / 'a'); b = build(Path(self.temp.name) / 'b')
        self.assertEqual(a['sha256'], b['sha256'])
        evidence = self.root / 'validation/evidence'; evidence.mkdir()
        (evidence / 'customer-run.json').write_text('{"private":true}')
        c = build(Path(self.temp.name) / 'c')
        self.assertEqual(a['sha256'], c['sha256'])
        dest = Path(self.temp.name) / 'extracted marketplace'
        with zipfile.ZipFile(a['archive']) as z:
            manifest = json.loads(z.read('RELEASE-MANIFEST.json'))
            self.assertEqual(set(z.namelist()), set(manifest['files']) | {'RELEASE-MANIFEST.json'})
            for name, digest in manifest['files'].items():
                self.assertFalse(name.startswith('/') or '..' in Path(name).parts)
                self.assertEqual(hashlib.sha256(z.read(name)).hexdigest(), digest)
            self.assertFalse(any('/evidence/' in n or '__pycache__' in n or '/node_modules/' in n for n in z.namelist()))
            z.extractall(dest)
        # Imports/paths must resolve in the extracted runtime from an unrelated cwd.
        for script in ['compiler.py', 'direct.py']:
            proc = subprocess.run([sys.executable, '-B', str(dest / 'plugins/toonkit/skills/3dref/scripts' / script), '--help'],
                                  cwd=self.temp.name, capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0, proc.stderr)
        proc = subprocess.run([sys.executable, '-B', str(dest / 'scripts/release.py'), 'check'],
                              cwd=self.temp.name, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)


if __name__ == '__main__':
    unittest.main()
