import sys

with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.read()

old_code = '''        const sortedPlayers = this.getSortedPlayers().filter(p => p.type && p.type.startsWith('mensalista'));
        const paid = sortedPlayers.filter(p => p.status === 'paid' || (p.position || '').toLowerCase().trim() === 'goleiro' || p.type === 'mensalista_isento');
        const pending = sortedPlayers.filter(p => p.status !== 'paid' && (p.position || '').toLowerCase().trim() !== 'goleiro' && p.type !== 'mensalista_isento');'''

new_code = '''        const sortedPlayers = this.getSortedPlayers().filter(p => p.type && p.type.startsWith('mensalista'));
        const playersToBill = sortedPlayers.filter(p => (p.position || '').toLowerCase().trim() !== 'goleiro' && p.type !== 'mensalista_isento');
        const paid = playersToBill.filter(p => p.status === 'paid');
        const pending = playersToBill.filter(p => p.status !== 'paid');'''

lines = lines.replace(old_code, new_code)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(lines)
