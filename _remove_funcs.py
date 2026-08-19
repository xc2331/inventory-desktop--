import re

PATH = r"C:\Users\4070\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a69bff1700b850e63b3d704\inventory-desktop\src\components\MaterialLibrary.jsx"

with open(PATH, 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.splitlines(keepends=True)
new_lines = []
i = 0
to_skip = {'MaterialCard', 'DetailPanel', 'DetailField'}
decl_re = re.compile(r'^function (\w+)\(')

while i < len(lines):
    line = lines[i]
    stripped = line.lstrip()
    m = decl_re.match(stripped)
    if m and m.group(1) in to_skip:
        state = 'params'  # scanning function params; parens may be nested
        paren_depth = 0
        brace_depth = 0
        while i < len(lines):
            for ch in lines[i]:
                if state == 'params':
                    if ch == '(':
                        paren_depth += 1
                    elif ch == ')':
                        paren_depth -= 1
                        if paren_depth == 0:
                            state = 'brace'
                elif state == 'brace':
                    if ch == '{':
                        brace_depth = 1
                        state = 'body'
                    # other chars ignored
                elif state == 'body':
                    if ch == '{':
                        brace_depth += 1
                    elif ch == '}':
                        brace_depth -= 1
                        if brace_depth == 0:
                            break
            i += 1
            if state == 'body' and brace_depth == 0:
                break
        new_lines.append('\n')
    else:
        new_lines.append(line)
        i += 1

result = ''.join(new_lines)
with open(PATH, 'w', encoding='utf-8') as f:
    f.write(result)
print("Done.")