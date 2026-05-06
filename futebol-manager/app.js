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
        this.renderAll();
    }

    async loadDataFromCloud() {
        try {
            const doc = await db.collection('appData').doc(this.docId).get();
            if (doc.exists) this.data = doc.data();
            else {
                const local = localStorage.getItem('futManagerData');
                if (local) { this.data = JSON.parse(local); await this.saveData(); }
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

    logout() {
        localStorage.removeItem('resenha_admin');
        this.checkAuth();
        this.renderAll();
        alert("Sessão Admin encerrada.");
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
    }

    bindEvents() {
        const navs = document.querySelectorAll('.nav-item, .nav-item-mobile');
        navs.forEach(b => b.addEventListener('click', (e) => {
            const t = e.currentTarget.dataset.target;
            navs.forEach(x => x.classList.toggle('active', x.dataset.target === t));
            document.querySelectorAll('.view-section').forEach(s => s.classList.toggle('active', s.id === t));
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
            } else alert("Dados incorretos!");
        });

        document.getElementById('match-date-select')?.addEventListener('change', () => this.renderAll());
    }

    renderDashboard() {
        const mensalistas = this.data.players.filter(p => p.type === 'mensalista');
        const paid = mensalistas.filter(p => p.status === 'paid').length;
        
        document.getElementById('dash-total-mensalistas').textContent = mensalistas.length;
        document.getElementById('dash-pagantes').textContent = paid;
        
        let bal = this.data.transactions.reduce((acc, t) => t.type === 'in' ? acc + t.amount : acc - t.amount, 0);
        document.getElementById('dash-caixa').textContent = `R$ ${bal.toFixed(2).replace('.', ',')}`;

        const date = document.getElementById('match-date-select')?.value || new Date().toISOString().split('T')[0];
        const att = this.data.attendance[date] || {};
        
        let pList = '', dList = '', aList = '', pCount = 0, dCount = 0, aCount = 0;
        this.getSortedPlayers(date).forEach(p => {
            const s = att[p.id] || 'doubt';
            if (p.type === 'avulso' && s === 'doubt') return;
            const color = s === 'present' ? 'var(--neon-green)' : (s === 'absent' ? 'var(--neon-red)' : 'var(--neon-orange)');
            const html = `<div style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between;"><span>${p.nickname || p.name}</span><span style="color:${color}; font-weight:bold;">${s.toUpperCase()}</span></div>`;
            if (s === 'present') { pList += html; pCount++; }
            else if (s === 'absent') { aList += html; aCount++; }
            else { dList += html; dCount++; }
        });

        document.getElementById('dash-confirmed-list').innerHTML = pList || 'Ninguém';
        document.getElementById('dash-pending-list').innerHTML = dList || 'Ninguém';
        document.getElementById('dash-absent-list').innerHTML = aList || 'Ninguém';
        document.getElementById('dash-confirmed-count').textContent = pCount;
        document.getElementById('dash-pending-count').textContent = dCount;
        document.getElementById('dash-absent-count').textContent = aCount;
        
        this.renderRecentIn();
    }

    renderRecentIn() {
        const list = document.getElementById('dash-recent-payments');
        if (!list) return;
        list.innerHTML = '';
        this.data.transactions.filter(t => t.type === 'in').sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 4).forEach(t => {
            list.innerHTML += `<li style="padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between;"><span>${t.description}</span><span style="color:var(--neon-green)">+R$ ${t.amount.toFixed(2)}</span></li>`;
        });
    }

    renderPlayers() {
        const tbody = document.getElementById('mensalistas-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        const isAdmin = localStorage.getItem('resenha_admin') === 'true';
        this.getSortedPlayers().filter(p => p.type === 'mensalista').forEach((p, i) => {
            const badge = p.status === 'paid' ? '<span class="badge badge-success">Pago</span>' : '<span class="badge badge-warning">Pendente</span>';
            const actionBtn = isAdmin ? `<td style="text-align:right"><button class="btn btn-primary" style="padding:4px 8px; font-size:12px;" onclick="app.registerPayment('${p.id}')">Pagar</button></td>` : '';
            tbody.innerHTML += `<tr><td><b>${p.nickname || p.name}</b></td><td>${p.position}</td><td>${badge}</td>${actionBtn}<td style="text-align:right; color:var(--text-muted)">${i+1}</td></tr>`;
        });
    }

    renderAttendance() {
        const list = document.getElementById('attendance-list');
        if (!list) return;
        const date = document.getElementById('match-date-select').value;
        const isAdmin = localStorage.getItem('resenha_admin') === 'true';
        list.innerHTML = '';
        this.getSortedPlayers(date).forEach(p => {
            const s = this.data.attendance[date]?.[p.id] || 'doubt';
            const color = s === 'present' ? 'var(--neon-green)' : (s === 'absent' ? 'var(--neon-red)' : 'var(--neon-orange)');
            const controls = isAdmin ? `<div style="display:flex; gap:8px;"><button class="btn" style="padding:4px 8px; background:rgba(255,255,255,0.05);" onclick="app.setAttendance('${date}','${p.id}','present')">✔</button><button class="btn" style="padding:4px 8px; background:rgba(255,255,255,0.05);" onclick="app.setAttendance('${date}','${p.id}','doubt')">?</button><button class="btn" style="padding:4px 8px; background:rgba(255,255,255,0.05);" onclick="app.setAttendance('${date}','${p.id}','absent')">✘</button></div>` : '';
            list.innerHTML += `<div class="glass-card" style="display:flex; justify-content:space-between; align-items:center; border-left:4px solid ${color}; padding:12px 20px;"><span><b>${p.nickname || p.name}</b></span>${controls}</div>`;
        });
    }

    renderFinance() {
        const tbody = document.getElementById('financeiro-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        let bal = 0;
        this.data.transactions.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(t => {
            const isIn = t.type === 'in';
            bal += isIn ? t.amount : -t.amount;
            tbody.innerHTML += `<tr><td>${t.date}</td><td>${t.description}</td><td style="color:${isIn?'var(--neon-green)':'var(--neon-red)'}">R$ ${t.amount.toFixed(2)}</td><td style="text-align:right"><button class="btn btn-danger" style="padding:4px 8px; font-size:12px;" onclick="app.deleteTransaction('${t.id}')">Excluir</button></td></tr>`;
        });
        document.getElementById('fin-balance').textContent = `R$ ${bal.toFixed(2).replace('.', ',')}`;
    }

    setAttendance(d, p, s) { if(!this.data.attendance[d]) this.data.attendance[d]={}; this.data.attendance[d][p]=s; this.saveData(); }
    
    registerPayment(id) { 
        const p = this.data.players.find(x => x.id == id);
        p.status = 'paid';
        this.data.transactions.push({id: Date.now().toString(), date: new Date().toISOString().split('T')[0], description: `Pgto - ${p.nickname}`, amount: 70, type: 'in', playerId: id});
        this.saveData();
    }

    deleteTransaction(id) {
        if(confirm("Excluir lançamento?")) {
            this.data.transactions = this.data.transactions.filter(t => t.id !== id);
            this.saveData();
        }
    }

    getSortedPlayers(d=null) { return [...this.data.players].sort((a,b) => (a.nickname||a.name).localeCompare(b.nickname||b.name)); }
    updateDate() { 
        const d = new Date().toLocaleDateString('pt-BR', {weekday:'long', day:'numeric', month:'long'}); 
        document.getElementById('current-date').textContent = d.charAt(0).toUpperCase() + d.slice(1); 
    }
}

const app = new FootballApp();
