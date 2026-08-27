from pathlib import Path
import zlib

repo_path = Path(r'c:/Users/natha/OneDrive/Desktop/Projects/financial-command-center')
git_path = repo_path / '.git'
head = (git_path / 'HEAD').read_text().strip()
output = []
output.append(f'HEAD={head}')
if head.startswith('ref: '):
    ref = head.split('ref: ',1)[1]
    ref_path = git_path / ref
    output.append(f'ref={ref}')
    if ref_path.exists():
        output.append(f'ref_hash={ref_path.read_text().strip()}')
    else:
        output.append('ref_file_missing')
else:
    output.append('HEAD is detached')

main_ref = git_path / 'refs' / 'heads' / 'main'
output.append(f'main_ref_exists={main_ref.exists()}')
if main_ref.exists():
    output.append(f'main_hash={main_ref.read_text().strip()}')

commit_hash = main_ref.read_text().strip() if main_ref.exists() else None
if commit_hash:
    obj_dir = git_path / 'objects' / commit_hash[:2] / commit_hash[2:]
    output.append(f'main_obj_exists={obj_dir.exists()}')
    if obj_dir.exists():
        raw = zlib.decompress(obj_dir.read_bytes())
        header, body = raw.split(b'\x00',1)
        output.append(f'commit_header={header.decode()}')
        tree_hash = None
        for line in body.decode('utf-8',errors='replace').splitlines():
            if line.startswith('tree '):
                tree_hash=line.split()[1]
                break
        output.append(f'tree_hash={tree_hash}')
        def read_object(hash_hex):
            path = git_path / 'objects' / hash_hex[:2] / hash_hex[2:]
            data = zlib.decompress(path.read_bytes())
            header, content = data.split(b'\x00',1)
            kind = header.split()[0].decode()
            return kind, content
        def find_in_tree(tree_hash, parts):
            kind, content = read_object(tree_hash)
            if kind!='tree':
                raise ValueError('not a tree')
            i = 0
            while i < len(content):
                j = content.find(b' ', i)
                mode = content[i:j].decode()
                k = content.find(b'\x00', j+1)
                name = content[j+1:k].decode()
                oid = content[k+1:k+21].hex()
                if name == parts[0]:
                    if len(parts)==1:
                        return oid
                    return find_in_tree(oid, parts[1:])
                i = k+21
            raise FileNotFoundError(parts[0])
        try:
            blob_hash = find_in_tree(tree_hash, ['frontend','src','App.jsx'])
            kind, content = read_object(blob_hash)
            output.append(f'blob_hash={blob_hash}')
            output.append('blob_first_line=' + content.decode('utf-8',errors='replace').splitlines()[0])
            (repo_path / 'scripts' / 'main_app_jsx.txt').write_text(content.decode('utf-8',errors='replace'), encoding='utf-8')
            output.append('wrote main_app_jsx.txt')
        except Exception as e:
            output.append('error=' + str(e))

(repo_path / 'scripts' / 'verify_main_app_output.txt').write_text('\n'.join(output), encoding='utf-8')
print('done')
