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
    config: { mensalValue: 70.00, avulsoValue: 25.00 }
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
        this.renderAll();
    }

    async loadDataFromCloud() {
        try {
            const doc = await db.collection('appData').doc(this.docId).get();
            if (doc.exists) {
                this.data = doc.data();
                console.log("Dados sincronizados com a nuvem.");
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
        if (isAdmin) document.body.classList.add('is-admin');
        else document.body.classList.remove('is-admin');
    }

    toggleFinances() {
        this.financesHidden = !this.financesHidden;
        const btn = document.getElementById('btn-toggle-finances');
        if (this.financesHidden) {
            document.body.classList.add('hide-finances');
            if(btn) btn.innerHTML = '<i class="ph ph-eye-slash"></i>';
        } else {
            document.body.classList.remove('hide-finances');
            if(btn) btn.innerHTML = '<i class="ph ph-eye"></i>';
        }
    }

    renderAll() {
        this.renderDashboard();
        this.renderPlayers();
        this.renderAttendance();
        this.renderFinance();
    }

    bindEvents() {
        const navs = document.querySelectorAll('.nav-item, .nav-item-mobile');
        navs.forEach(b => b.addEventListener('click', (e) => {
            const t = e.currentTarget.dataset.target;
            navs.forEach(x => x.classList.toggle('active', x.dataset.target === t));
            document.querySelectorAll('.view-section').forEach(s => s.classList.toggle('active', s.id === t));
            document.getElementById('page-title').textContent = e.currentTarget.textContent.trim();
        }));
        
        const loginForm = document.getElementById('admin-login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
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
        }

        document.getElementById('player-form').addEventListener('submit', (e) => this.handlePlayerSubmit(e));
        document.getElementById('transaction-form').addEventListener('submit', (e) => this.handleTransactionSubmit(e));
        document.getElementById('match-date-select').addEventListener('change', () => this.renderAll());
    }

    renderDashboard() {
        const todos = this.data.players;
        const mensalistas = todos.filter(p => p.type === 'mensalista');
        const pagantes = mensalistas.filter(p => (p.position||'').toLowerCase() !== 'goleiro');
        const paid = pagantes.filter(p => p.status === 'paid').length;
        
        document.getElementById('dash-total-mensalistas').textContent = mensalistas.length;
        document.getElementById('dash-pagantes').innerHTML = `${paid}<span class="sub-value">/${pagantes.length}</span>`;
        
        let bal = this.data.transactions.reduce((acc, t) => t.type === 'in' ? acc + t.amount : acc - t.amount, 0);
        document.getElementById('dash-caixa').textContent = `R$ ${bal.toFixed(2).replace('.', ',')}`;

        const date = document.getElementById('match-date-select').value;
        const att = this.data.attendance[date] || {};
        
        let pList = '', dList = '', aList = '', pCount = 0, dCount = 0, aCount = 0;

        this.getSortedPlayers(date).forEach(p => {
            const s = att[p.id] || 'doubt';
            if (p.type === 'avulso' && s === 'doubt') return;
            
            const color = s === 'present' ? 'var(--neon-green)' : (s === 'absent' ? 'var(--neon-red)' : 'var(--neon-orange)');
            const icon = s === 'present' ? 'ph-check-circle' : (s === 'absent' ? 'ph-x-circle' : 'ph-question');
            
            const html = `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:12px; background:rgba(255,255,255,0.03); border-radius:8px; margin-bottom:8px; border-left:3px solid ${color}; overflow: hidden;">
                    <div style="display:flex; align-items:center; gap:12px; min-width: 0; flex: 1;">
                        <div class="act-avatar" style="flex-shrink: 0;"><i class="ph ph-user"></i></div>
                        <div style="min-width: 0;">
                            <div style="font-weight:600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px;">
                                ${p.nickname || p.name}
                                <span style="font-size: 10px; color: var(--neon-blue); border: 1px solid var(--neon-blue); padding: 1px 6px; border-radius: 4px; flex-shrink: 0;">${p.position}</span>
                            </div>
                            <div style="font-size:11px; color:var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.fullName || ''}</div>
                        </div>
                    </div>
                    <i class="ph-fill ${icon}" style="font-size:24px; color:${color}; flex-shrink: 0; margin-left: 12px;"></i>
                </div>`;
            
            if (s === 'present') { pList += html; pCount++; }
            else if (s === 'absent') { aList += html; aCount++; }
            else { dList += html; dCount++; }
        });

        document.getElementById('dash-confirmed-list').innerHTML = pList || '<p style="padding:12px;color:var(--text-muted)">Ninguém confirmado</p>';
        document.getElementById('dash-pending-list').innerHTML = dList || '<p style="padding:12px;color:var(--text-muted)">Nenhuma dúvida</p>';
        document.getElementById('dash-absent-list').innerHTML = aList || '<p style="padding:12px;color:var(--text-muted)">Ninguém ausente</p>';
        document.getElementById('dash-confirmed-count').textContent = pCount;
        document.getElementById('dash-pending-count').textContent = dCount;
        document.getElementById('dash-absent-count').textContent = aCount;
        
        this.renderRecentIn();
        this.renderChart();
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
        container.innerHTML = `<div style="display:flex;justify-content:space-around;align-items:flex-end;height:100%;gap:12px;"><div style="display:flex;flex-direction:column;align-items:center;width:30%;height:100%;justify-content:flex-end;"><div style="background:var(--neon-green);opacity:0.3;width:100%;height:${(tM/max)*80}%"></div><span style="font-size:10px;">Mensal</span></div><div style="display:flex;flex-direction:column;align-items:center;width:30%;height:100%;justify-content:flex-end;"><div style="background:var(--neon-blue);opacity:0.3;width:100%;height:${(tA/max)*80}%"></div><span style="font-size:10px;">Avulso</span></div><div style="display:flex;flex-direction:column;align-items:center;width:30%;height:100%;justify-content:flex-end;"><div style="background:var(--neon-red);opacity:0.3;width:100%;height:${(tG/max)*80}%"></div><span style="font-size:10px;">Gastos</span></div></div>`;
    }

    renderPlayers() {
        const tbody = document.getElementById('mensalistas-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        this.getSortedPlayers().filter(p => p.type === 'mensalista').forEach((p, i) => {
            const isGoleiro = (p.position||'').toLowerCase() === 'goleiro';
            const badge = p.status === 'paid' ? '<span class="badge badge-success">Pago</span>' : (isGoleiro ? '<span class="badge badge-info">Isento</span>' : '<span class="badge badge-warning">Pendente</span>');
            tbody.innerHTML += `<tr><td>${i+1}</td><td><b>${p.nickname || p.name}</b><br><small>${p.fullName || ''}</small></td><td>${p.position}</td><td>${badge}</td><td style="text-align:right"><button class="action-btn admin-only" onclick="app.registerPayment('${p.id}')" style="color:var(--neon-green)"><i class="ph ph-money"></i></button><button class="action-btn admin-only" onclick="app.openPlayerModal('${p.id}')"><i class="ph ph-pencil-simple"></i></button></td></tr>`;
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
            list.innerHTML += `<div class="player-card ${s}"><div class="player-info"><div style="display:flex;align-items:center;gap:12px;"><div class="act-avatar"><i class="ph ph-user"></i></div><div><b>${p.nickname || p.name}</b><br><small>${p.position}</small></div></div><div class="admin-only"><button class="action-btn" onclick="app.registerPayment('${p.id}')" style="color:var(--neon-green)"><i class="ph ph-money"></i></button></div></div><div class="attendance-controls"><button class="att-btn ${s==='present'?'active-green':''}" onclick="app.setAttendance('${date}','${p.id}','present')"><i class="ph-fill ph-check-circle"></i></button><button class="att-btn ${s==='doubt'?'active-orange':''}" onclick="app.setAttendance('${date}','${p.id}','doubt')"><i class="ph-fill ph-question"></i></button><button class="att-btn ${s==='absent'?'active-red':''}" onclick="app.setAttendance('${date}','${p.id}','absent')"><i class="ph-fill ph-x-circle"></i></button></div></div>`;
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
    }

    setAttendance(d, p, s) { if(!this.data.attendance[d]) this.data.attendance[d]={}; this.data.attendance[d][p]=s; this.saveData(); }
    registerPayment(id) { const p = this.data.players.find(x => x.id == id); p.status='paid'; this.data.transactions.push({id:Date.now().toString(), date:new Date().toISOString().split('T')[0], description:`Pgto - ${p.nickname}`, amount:p.type==='mensalista'?70:25, type:'in'}); this.saveData(); }
    getSortedPlayers(d=null) { return [...this.data.players].filter(p => !p.isTemporary || d === p.validDate).sort((a,b) => (a.nickname||a.name).localeCompare(b.nickname||b.name)); }
    updateDate() { const d = new Date().toLocaleDateString('pt-BR', {weekday:'long', year:'numeric', month:'long', day:'numeric'}); document.getElementById('current-date').textContent = d.charAt(0).toUpperCase() + d.slice(1); }
    formatDateBR(d) { const p = d.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d; }
    openPlayerModal(id) { /* ... */ }
    handlePlayerSubmit(e) { /* ... */ }
    deleteTransaction(id) { if(confirm("Excluir?")) { this.data.transactions = this.data.transactions.filter(t => t.id != id); this.saveData(); } }
    copyAttendanceToWhatsApp() { /* ... */ }
    copyDoubtListToWhatsApp() { /* ... */ }
    shareDashboard() { /* ... */ }
    toggleDashList(id, btn) {
        const list = document.getElementById(id);
        const icon = btn.querySelector('.ph-caret-up') || btn.querySelector('.ph-caret-down');
        if (list.classList.contains('collapsed')) {
            list.classList.remove('collapsed');
            if(icon) icon.classList.replace('ph-caret-down', 'ph-caret-up');
        } else {
            list.classList.add('collapsed');
            if(icon) icon.classList.replace('ph-caret-up', 'ph-caret-down');
        }
    }
}

const app = new FootballApp();
