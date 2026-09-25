import sys
with open('index.html', 'r', encoding='utf-8') as f:
    lines = f.read()

lines = lines.replace('<option value="mensalista">Mensalista</option>', '<option value="mensalista">Mensalista</option>\n                        <option value="mensalista_isento">Mensalista Isento</option>')
lines = lines.replace('style.css?v=57', 'style.css?v=61')
lines = lines.replace('app.js?v=59', 'app.js?v=61')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(lines)
