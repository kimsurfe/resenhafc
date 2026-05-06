const firebaseConfig = {
    apiKey: "AIzaSyBDrruu7PFK1xWJ8x77KaZSO-A1HxlRo1s",
    authDomain: "resenha-fc-3543b.firebaseapp.com",
    projectId: "resenha-fc-3543b",
    storageBucket: "resenha-fc-3543b.firebasestorage.app",
    messagingSenderId: "825293531934",
    appId: "1:825293531934:web:7f52316cabb168f4a5b70f"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const DEFAULT_DATA = {
    players: [],
    transactions: [],
    attendance: {},
    config: { mensalValue: 70.00, avulsoValue: 20.00 }
};

class FootballApp {
    constructor() {
        this.data = DEFAULT_DATA;
        this.docId = 'mainData';
        this.financesHidden = false;
        this.init();
    }

    async init() {
        this.bindEvents();
        this.updateDate();
        await this.loadDataFromCloud();
        this.checkAuth();
        this.fixMarlon();
        this.renderAll();
    }

    fixMarlon() {
        const marlon = this.data.players.find(p => p.nickname?.includes('Marlon') || p.name?.includes('Marlon'));
        if (marlon) marlon.type = 'avulso';
    }

    async loadDataFromCloud() {
        try {
            const doc = await db.collection('appData').doc(this.docId).get();
            if (doc.exists) {
                this.data = doc.data();
                if (!this.data.config) this.data.config = { mensalValue: 70, avulsoValue: 20 };
            } else {
                const local = localStorage.getItem('futManagerData');
                if (local) {
                    this.data = JSON.parse(local);
                    await this.saveData();
                }
            }
        } catch (e) { console.error(e); }
    }

    async saveData() {
        try {
            await db.collection('appData').doc(this.docId).set(this.data);
            localStorage.setItem('futManagerData', JSON.stringify(this.data));
            this.renderAll();
        } catch (e) { console.error(e); }
    }

    checkAuth() {
        const isAdmin = localStorage.getItem('resenha_admin') === 'true';
        document.body.classList.toggle('is-admin', isAdmin);
    }

    toggleFinances() {
        this.financesHidden = !this.financesHidden;
        const btn = document.getElementById('btn-toggle-finances');
        document.body.classList.toggle('hide-finances', this.financesHidden);
        if(btn) btn.innerHTML = this.financesHidden ? '<i class="ph ph-eye-slash"></i>' : '<i class="ph ph-eye"></i>';
    }

    renderAll() {
        this.renderDashboard();
        this.renderPlayers();
        this.renderAttendance();
        this.renderFinance();
        this.updateSorteioPool();
    }

    bindEvents() {
        const navs = document.querySelectorAll('.nav-item, .nav-item-mobile');
        navs.forEach(b => b.addEventListener('click', (e) => {
            const t = e.currentTarget.dataset.target;
            navs.forEach(x => x.classList.toggle('active', x.dataset.target === t));
            document.querySelectorAll('.view-section').forEach(s => s.classList.toggle('active', s.id === t));
            document.getElementById('page-title').textContent = e.currentTarget.textContent.trim();
        }));
        
        document.getElementById('admin-login-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const u = document.getElementById('admin-user').value;
            const p = document.getElementById('admin-pass').value;
            if (u === 'kim' && p === '220688') {
                localStorage.setItem('resenha_admin', 'true');
                this.checkAuth();
                document.getElementById('login-modal').classList.remove('active');
                this.renderAll();
            } else {
                document.getElementById('admin-login-error').style.display = 'block';
            }
        });

        document.getElementById('player-form').addEventListener('submit', (e) => this.handlePlayerSubmit(e));
        document.getElementById('transaction-form').addEventListener('submit', (e) => this.handleTransactionSubmit(e));
        document.getElementById('match-date-select').addEventListener('change', () => this.renderAll());
    }

    renderDashboard() {
        const date = document.getElementById('match-date-select').value;
        const att = this.data.attendance[date] || {};
        
        let pList = '', dList = '', aList = '', pCount = 0, dCount = 0, aCount = 0;

        this.getSortedPlayers(date).forEach(p => {
            const s = att[p.id] || 'doubt';
            if (p.type === 'avulso' && s === 'doubt') return;
            
            const color = s === 'present' ? 'var(--neon-green)' : (s === 'absent' ? 'var(--neon-red)' : 'var(--neon-orange)');
            const icon = s === 'present' ? 'ph-check-circle' : (s === 'absent' ? 'ph-x-circle' : 'ph-question');
            
            const html = `<div class="dash-player-card" style="border-left:3px solid ${color}"><div class="info"><div class="act-avatar"><i class="ph ph-user"></i></div><div><b>${p.nickname || p.name}</b><span class="pos-badge">${p.position}</span><br><small>${p.fullName || ''}</small></div></div><i class="ph-fill ${icon}" style="color:${color}"></i></div>`;
            
            if (s === 'present') { pList += html; pCount++; }
            else if (s === 'absent') { aList += html; aCount++; }
            else { dList += html; dCount++; }
        });

        document.getElementById('dash-confirmed-list').innerHTML = pList || '<p class="empty-msg">Ninguém confirmado</p>';
        document.getElementById('dash-pending-list').innerHTML = dList || '<p class="empty-msg">Nenhuma dúvida</p>';
        document.getElementById('dash-absent-list').innerHTML = aList || '<p class="empty-msg">Ninguém ausente</p>';
        document.getElementById('dash-confirmed-count').textContent = pCount;
        document.getElementById('dash-pending-count').textContent = dCount;
        document.getElementById('dash-absent-count').textContent = aCount;
        
        const mensalistas = this.data.players.filter(p => p.type === 'mensalista');
        const pagantes = mensalistas.filter(p => (p.position||'').toLowerCase() !== 'goleiro');
        const paidCount = pagantes.filter(p => p.status === 'paid').length;
        
        document.getElementById('dash-total-mensalistas').textContent = mensalistas.length;
        document.getElementById('dash-pagantes').innerHTML = `${paidCount}<span class="sub-value">/${pagantes.length}</span>`;
        
        let bal = this.data.transactions.reduce((acc, t) => t.type === 'in' ? acc + t.amount : acc - t.amount, 0);
        document.getElementById('dash-caixa').textContent = `R$ ${bal.toFixed(2).replace('.', ',')}`;
        
        this.renderRecentIn();
        this.renderChart();
        this.updateNextGameDate();
    }

    updateNextGameDate() {
        const today = new Date();
        const nextWed = new Date(today);
        nextWed.setDate(today.getDate() + (3 + 7 - today.getDay()) % 7);
        const day = String(nextWed.getDate()).padStart(2, '0');
        const month = String(nextWed.getMonth() + 1).padStart(2, '0');
        document.getElementById('dash-next-game').textContent = `Quarta, ${day}/${month} - 21:00`;
    }

    renderRecentIn() {
        const list = document.getElementById('dash-recent-payments');
        if (!list) return;
        list.innerHTML = '';
        this.data.transactions.filter(t => t.type === 'in').sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 4).forEach(t => {
            list.innerHTML += `<li class="activity-item"><div class="act-info"><div class="act-avatar"><i class="ph ph-user"></i></div><div class="act-details"><p>${t.description}</p><span>${this.formatDateBR(t.date)}</span></div></div><div class="act-amount">+ R$ ${t.amount.toFixed(2)}</div></li>`;
        });
    }

    renderChart() {
        const container = document.getElementById('financial-summary-chart');
        if (!container) return;
        let tM = 0, tA = 0, tG = 0;
        this.data.transactions.forEach(t => {
            if (t.type === 'in') { if (t.description.toLowerCase().includes('avulso')) tA += t.amount; else tM += t.amount; }
            else tG += t.amount;
        });
        const max = Math.max(tM, tA, tG, 1);
        container.innerHTML = `<div class="mini-chart"><div class="bar-container"><div class="bar green" style="height:${(tM/max)*80}%"></div><span>Mensal</span></div><div class="bar blue" style="height:${(tA/max)*80}%"></div><span>Avulso</span></div><div class="bar red" style="height:${(tG/max)*80}%"></div><span>Gastos</span></div></div>`;
    }

    renderPlayers() {
        const tbody = document.getElementById('mensalistas-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        this.getSortedPlayers().filter(p => p.type === 'mensalista').forEach((p, i) => {
            const isGoleiro = (p.position||'').toLowerCase() === 'goleiro';
            const badge = p.status === 'paid' ? '<span class="badge badge-success">Pago</span>' : (isGoleiro ? '<span class="badge badge-info">Isento</span>' : '<span class="badge badge-warning">Pendente</span>');
            const actionBtn = p.status === 'paid' ? 
                `<button class="action-btn admin-only" onclick="app.undoPayment('${p.id}')" style="color:var(--neon-red); font-size:20px;"><i class="ph ph-arrow-u-up-left"></i></button>` : 
                `<button class="action-btn admin-only" onclick="app.registerPayment('${p.id}')" style="color:var(--neon-green); font-size:20px;"><i class="ph ph-money"></i></button>`;

            tbody.innerHTML += `<tr><td><b>${p.nickname || p.name}</b><br><small>${p.fullName || ''}</small></td><td>${p.position}</td><td>${badge}</td><td style="text-align:right">${actionBtn}<button class="action-btn admin-only" onclick="app.openPlayerModal('${p.id}')" style="font-size:20px;"><i class="ph ph-pencil-simple"></i></button></td><td style="text-align:right; width:40px; color:var(--text-muted)">${i+1}</td></tr>`;
        });
    }

    renderAttendance() {
        const list = document.getElementById('attendance-list');
        if (!list) return;
        const date = document.getElementById('match-date-select').value;
        list.innerHTML = '';
        let pc = 0, dc = 0, ac = 0;
        this.getSortedPlayers(date).forEach(p => {
            const s = this.data.attendance[date]?.[p.id] || 'doubt';
            if (s === 'present') pc++; else if (s === 'absent') ac++; else dc++;
            const color = s === 'present' ? 'var(--neon-green)' : (s === 'absent' ? 'var(--neon-red)' : 'var(--neon-orange)');
            list.innerHTML += `<div class="player-card ${s}" style="border-left:3px solid ${color}"><div class="player-info"><b>${p.nickname || p.name}</b><br><small>${p.position}</small></div><div class="attendance-controls"><button class="att-btn ${s==='present'?'active-green':''}" onclick="app.setAttendance('${date}','${p.id}','present')" style="color:${s==='present'?'var(--neon-green)':''}"><i class="ph-fill ph-check-circle"></i></button><button class="att-btn ${s==='doubt'?'active-orange':''}" onclick="app.setAttendance('${date}','${p.id}','doubt')" style="color:${s==='doubt'?'var(--neon-orange)':''}"><i class="ph-fill ph-question"></i></button><button class="att-btn ${s==='absent'?'active-red':''}" onclick="app.setAttendance('${date}','${p.id}','absent')" style="color:${s==='absent'?'var(--neon-red)':''}"><i class="ph-fill ph-x-circle"></i></button></div></div>`;
        });
        document.getElementById('presenca-count').textContent = pc;
        document.getElementById('doubt-count').textContent = dc;
        document.getElementById('absent-count').textContent = ac;
    }

    renderFinance() {
        const tbody = document.getElementById('financeiro-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        let bal = 0;
        this.data.transactions.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(t => {
            const isIn = t.type === 'in';
            bal += isIn ? t.amount : -t.amount;
            tbody.innerHTML += `<tr><td>${this.formatDateBR(t.date)}</td><td>${t.description}</td><td>${isIn?'Entrada':'Saída'}</td><td>R$ ${t.amount.toFixed(2)}</td><td style="text-align:right"><button class="action-btn" onclick="app.deleteTransaction('${t.id}')" style="color:var(--neon-red)"><i class="ph ph-trash"></i></button></td></tr>`;
        });
        document.getElementById('fin-balance').textContent = `R$ ${bal.toFixed(2).replace('.', ',')}`;
        document.getElementById('config-mensal').value = this.data.config?.mensalValue || 70;
        document.getElementById('config-avulso').value = this.data.config?.avulsoValue || 20;
    }

    updateSorteioPool() {
        const pool = document.getElementById('sorteio-pool');
        if (!pool) return;
        const date = document.getElementById('match-date-select').value;
        const confirmed = this.getSortedPlayers(date).filter(p => (this.data.attendance[date]?.[p.id] || 'doubt') === 'present');
        pool.innerHTML = confirmed.length ? confirmed.map(p => `<div class="draw-name"><b>${p.nickname || p.name}</b><br><small>${p.position}</small></div>`).join('') : '<p class="empty-msg">Nenhum confirmado.</p>';
        document.getElementById('sorteio-total-count').textContent = confirmed.length;
    }

    setAttendance(d, p, s) { if(!this.data.attendance[d]) this.data.attendance[d]={}; this.data.attendance[d][p]=s; this.saveData(); }
    
    registerPayment(id) { 
        const p = this.data.players.find(x => x.id == id);
        p.status = 'paid';
        this.data.transactions.push({id: Date.now().toString(), date: new Date().toISOString().split('T')[0], description: `Pgto - ${p.nickname}`, amount: p.type==='mensalista'?70:20, type: 'in', playerId: id});
        this.saveData();
    }

    undoPayment(id) {
        const p = this.data.players.find(x => x.id == id);
        p.status = 'unpaid';
        this.data.transactions = this.data.transactions.filter(t => t.playerId !== id);
        this.saveData();
    }

    deleteTransaction(id) {
        if(confirm("Deseja excluir este lançamento?")) {
            const t = this.data.transactions.find(x => x.id === id);
            if (t && t.playerId) {
                const p = this.data.players.find(x => x.id === t.playerId);
                if (p) p.status = 'unpaid';
            }
            this.data.transactions = this.data.transactions.filter(x => x.id !== id);
            this.saveData();
        }
    }

    saveConfig() {
        this.data.config = {
            mensalValue: parseFloat(document.getElementById('config-mensal').value),
            avulsoValue: parseFloat(document.getElementById('config-avulso').value)
        };
        this.saveData();
        alert("Valores atualizados!");
    }

    getSortedPlayers(d=null) { return [...this.data.players].filter(p => !p.isTemporary || d === p.validDate).sort((a,b) => (a.nickname||a.name).localeCompare(b.nickname||b.name)); }
    updateDate() { const d = new Date().toLocaleDateString('pt-BR', {weekday:'long', year:'numeric', month:'long', day:'numeric'}); document.getElementById('current-date').textContent = d.charAt(0).toUpperCase() + d.slice(1); }
    formatDateBR(d) { const p = d.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d; }
    openPlayerModal(id) { 
        const p = id ? this.data.players.find(x => x.id == id) : null;
        document.getElementById('modal-player-id').value = id || '';
        document.getElementById('player-name').value = p ? p.name : '';
        document.getElementById('player-nickname').value = p ? p.nickname : '';
        document.getElementById('player-fullname').value = p ? p.fullName || '' : '';
        document.getElementById('player-type').value = p ? p.type : 'mensalista';
        document.getElementById('player-position').value = p ? p.position : 'Lateral';
        document.getElementById('player-modal').classList.add('active');
    }
}
const app = new FootballApp();
