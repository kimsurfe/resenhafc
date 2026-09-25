import sys

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_badge = '''            if (isGoleiro) {
                statusBadge = '<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3)">Isento</span>';
            } else if (p.status === 'paid') {'''

new_badge = '''            if (isGoleiro) {
                statusBadge = '<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3)">Goleiro Isento</span>';
            } else if (p.type === 'mensalista_isento') {
                statusBadge = '<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3)">Mensalista Isento</span>';
            } else if (p.status === 'paid') {'''

old_btn = '''            let paymentBtn = '';
            if (!isGoleiro) {
                paymentBtn = p.status !== 'paid' '''

new_btn = '''            let paymentBtn = '';
            if (!isGoleiro && p.type !== 'mensalista_isento') {
                paymentBtn = p.status !== 'paid' '''

content = content.replace(old_badge, new_badge)
content = content.replace(old_btn, new_btn)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
