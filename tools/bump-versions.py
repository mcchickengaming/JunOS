"""Bump ?v= cache-busters for changed webapp files, cascading to importers.

usage: python3 tools/bump-versions.py webapp changed/file.js [more...]
Every reference to a changed file gets its ?v= incremented (one consistent
new number per file). Any file whose text changes because of that is itself
treated as changed, until nothing new changes. index.html is never versioned.
"""
import os, re, sys

root = os.path.abspath(sys.argv[1])
REF = re.compile(r"""(['"(])([^'"()\s]+?\.(?:js|css))\?v=(\d+)""")

files = []
for d, _, fs in os.walk(root):
    if "/assets" in d or "/vendor" in d or "node_modules" in d:
        continue
    for f in fs:
        if f.endswith((".js", ".css", ".html")):
            files.append(os.path.join(d, f))


def resolve(src, ref):
    base = root if ref.startswith("/") else os.path.dirname(src)
    if src.endswith("index.html") or src.endswith("boot-gate.js"):
        base = root
    return os.path.normpath(os.path.join(base, ref.lstrip("/")))


queue = [os.path.abspath(os.path.join(root, p)) if not os.path.isabs(p) else p for p in sys.argv[2:]]
done = set()
newver = {}
while queue:
    target = queue.pop()
    if target in done:
        continue
    done.add(target)
    # highest version currently used for target anywhere, +1
    cur = 0
    for f in files:
        for m in REF.finditer(open(f, encoding="utf-8").read()):
            if resolve(f, m.group(2)) == target:
                cur = max(cur, int(m.group(3)))
    nv = cur + 1
    newver[target] = nv
    for f in files:
        txt = open(f, encoding="utf-8").read()
        def sub(m):
            if resolve(f, m.group(2)) == target:
                return f"{m.group(1)}{m.group(2)}?v={nv}"
            return m.group(0)
        new = REF.sub(sub, txt)
        if new != txt:
            open(f, "w", encoding="utf-8").write(new)
            if not f.endswith("index.html") and f not in done:
                queue.append(f)

for t, v in sorted(newver.items()):
    print(os.path.relpath(t, root), "->", v)
