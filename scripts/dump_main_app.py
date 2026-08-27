import zlib
from pathlib import Path

repo_path = Path(r'c:/Users/natha/OneDrive/Desktop/Projects/financial-command-center')
git_path = repo_path / '.git'
ref_path = git_path / 'refs' / 'heads' / 'main'
if not ref_path.exists():
    raise FileNotFoundError(f'Main ref not found at {ref_path}')
commit_hash = ref_path.read_text().strip()
obj_dir = git_path / 'objects' / commit_hash[:2]
obj_file = obj_dir / commit_hash[2:]
if not obj_file.exists():
    raise FileNotFoundError(f'Commit object not found at {obj_file}')
raw = zlib.decompress(obj_file.read_bytes())
header, body = raw.split(b"\x00", 1)
if not header.startswith(b'commit '):
    raise ValueError('Not a commit object')
lines = body.decode('utf-8', errors='replace').splitlines()
tree_hash = None
for line in lines:
    if line.startswith('tree '):
        tree_hash = line.split()[1]
        break
if not tree_hash:
    raise ValueError('Tree hash not found in commit')

def read_object(hash_hex: str):
    path = git_path / 'objects' / hash_hex[:2] / hash_hex[2:]
    if not path.exists():
        raise FileNotFoundError(f'Object {hash_hex} not found')
    data = zlib.decompress(path.read_bytes())
    header, content = data.split(b'\x00', 1)
    kind, size = header.split()
    return kind.decode(), content


def find_in_tree(tree_hash: str, path_parts):
    kind, content = read_object(tree_hash)
    if kind != 'tree':
        raise ValueError(f'Object {tree_hash} is not a tree')
    i = 0
    while i < len(content):
        mode_end = content.find(b' ', i)
        mode = content[i:mode_end].decode()
        name_end = content.find(b'\x00', mode_end + 1)
        name = content[mode_end+1:name_end].decode()
        obj_hash = content[name_end+1:name_end+21].hex()
        i = name_end + 21
        if name == path_parts[0]:
            if len(path_parts) == 1:
                return obj_hash
            return find_in_tree(obj_hash, path_parts[1:])
    raise FileNotFoundError(f'Path {"/".join(path_parts)} not found in tree {tree_hash}')

path_parts = ['frontend', 'src', 'App.jsx']
blob_hash = find_in_tree(tree_hash, path_parts)
kind, content = read_object(blob_hash)
if kind != 'blob':
    raise ValueError('Target is not a blob')
output_path = repo_path / 'scripts' / 'main_app_jsx.txt'
output_path.write_text(content.decode('utf-8'), encoding='utf-8')
print(f'Wrote main App.jsx to {output_path}')
