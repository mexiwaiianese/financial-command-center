from pathlib import Path

repo = Path(r'c:/Users/natha/OneDrive/Desktop/Projects/financial-command-center')
files = [repo / 'frontend' / 'src' / 'App.jsx', repo / 'frontend' / 'src' / 'lib' / 'api.js', repo / 'frontend' / 'src' / 'styles.css']

def resolve_file(path):
    text = path.read_text(encoding='utf-8')
    lines = text.splitlines(True)
    out = []
    state = 'normal'
    for line in lines:
        if state == 'normal':
            if line.startswith('<<<<<<< HEAD'):
                state = 'skip_head'
                continue
            out.append(line)
        elif state == 'skip_head':
            if line.startswith('======='):
                state = 'keep_main'
                continue
            continue
        elif state == 'keep_main':
            if line.startswith('>>>>>>>'):
                state = 'normal'
                continue
            out.append(line)
    if state != 'normal':
        raise RuntimeError(f'Unterminated conflict in {path}')
    path.write_text(''.join(out), encoding='utf-8')
    print(f'Resolved {path}')

for f in files:
    resolve_file(f)
