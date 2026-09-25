import sys

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# For registerPayment
register_old = '''    registerPayment(id, skipSave = false) {
        // Normaliza ID para string na busca para evitar erros de tipo (Number vs String)
        const player = this.data.players.find(p => String(p.id) === String(id));
        if(!player) return;'''

register_new = '''    registerPayment(id, skipSave = false) {
        // Normaliza ID para string na busca para evitar erros de tipo (Number vs String)
        const player = this.data.players.find(p => String(p.id) === String(id));
        if(!player) return;

        // Se for mensalista isento, não gera transação financeira
        if (player.type === 'mensalista_isento') {
            player.status = 'paid';
            if (!skipSave) this.saveData();
            return;
        }'''

# For undoPayment
undo_old = '''    undoPayment(id, skipSave = false) {
        const player = this.data.players.find(p => String(p.id) === String(id));
        if(!player) return;'''

undo_new = '''    undoPayment(id, skipSave = false) {
        const player = this.data.players.find(p => String(p.id) === String(id));
        if(!player) return;

        // Se for mensalista isento, não afeta transações financeiras
        if (player.type === 'mensalista_isento') {
            player.status = 'unpaid';
            if (!skipSave) this.saveData();
            return;
        }'''

content = content.replace(register_old, register_new)
content = content.replace(undo_old, undo_new)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
