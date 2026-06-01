const firebaseConfig = {
    apiKey: "AIzaSyBDrruu7PfK1xWJ8x77KaZSO-A1HxlRo1s",
    authDomain: "resenha-fc-3543b.firebaseapp.com",
    projectId: "resenha-fc-3543b",
    storageBucket: "resenha-fc-3543b.firebasestorage.app",
    messagingSenderId: "825293531934",
    appId: "1:825293531934:web:7f52316cabb168f4a5b70f"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const messaging = firebase.messaging();

messaging.onMessage((payload) => {
    console.log('Mensagem recebida em primeiro plano:', payload);
    if (payload.notification) {
        // Mostra um banner bonito no topo da tela para evitar bloqueios do iOS (alert() é bloqueado no PWA)
        const toast = document.createElement('div');
        toast.style.position = 'fixed';
        toast.style.top = '20px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.backgroundColor = 'var(--neon-blue)';
        toast.style.color = 'white';
        toast.style.padding = '16px 24px';
        toast.style.borderRadius = '12px';
        toast.style.boxShadow = '0 10px 30px rgba(59,130,246,0.5)';
        toast.style.zIndex = '999999';
        toast.style.width = '90%';
        toast.style.maxWidth = '400px';
        toast.style.textAlign = 'center';
        toast.style.animation = 'slideDown 0.5s ease-out forwards';
        toast.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 8px;">🔔</div>
            <strong style="font-size: 16px; display: block; margin-bottom: 4px;">${payload.notification.title}</strong>
            <span style="font-size: 14px; opacity: 0.9;">${payload.notification.body}</span>
            <button onclick="this.parentElement.remove()" style="margin-top: 12px; background: rgba(255,255,255,0.2); border: none; color: white; padding: 6px 12px; border-radius: 6px; width: 100%; cursor: pointer;">Fechar</button>
        `;
        document.body.appendChild(toast);
        
        // Auto-fechar após 10 segundos
        setTimeout(() => { if(toast.parentElement) toast.remove(); }, 10000);
    }
});

const DEFAULT_DATA = {
    players: [],
    transactions: [],
    attendance: {},
    customPushes: [],
    config: {
        mensalValue: 50.00,
        avulsoValue: 20.00,
        attendanceCustomMessage: `Avulsos deverão pagar antes da partida para o pix:\n\n13997741390\nLEANDRO MORAES DA SILVA\n\nPara confirmar presença, acessar o link abaixo:\nwww.gestaoresenhafc.vercel.app`,
        includeDate: true,
        includeWarning: true,
        includePresent: true,
        includeWaiting: true,
        includeAbsent: true,
        matchDay: 3,
        matchTime: "21:00",
        rotationDay: 4
    },
    appSettings: {
        name: "RESENHA F.C",
        logo: "resenha_logotipo.jpg"
    },
    adminSettings: {
        user: "kim",
        pass: "220688"
    },
    notifications: {
        notifyOnOpen: true,
        notifyDay3: false,
        notifyDay2: false,
        notifyDay1: false
    }
};

class FootballApp {
    constructor() {
        this.data = DEFAULT_DATA;
        this.financesHidden = false;
        this.showFullRanking = false;
        this.drawSelections = new Set();
        this.playerPaymentFilter = 'all'; // New state for filtering
        this.docId = 'mainData'; // Documento único no Firestore
        this.init();
    }

    async init() {
        this.bindEvents();
        this.updateDate();
        this.initMatchDate();
        await this.loadDataFromCloud();
        this.loadAppSettings();
        this.checkAuth();
        this.initPullToRefresh();
        this.checkNotificationPermission();
        this.renderAll();
    }

    async loadDataFromCloud() {
        try {
            const doc = await db.collection('appData').doc(this.docId).get();
            if (doc.exists) {
                this.data = doc.data();
                console.log("Dados carregados da nuvem.");
            } else {
                console.log("Nenhum dado na nuvem. Verificando migração local...");
                const local = localStorage.getItem('futManagerData');
                if (local) {
                    this.data = JSON.parse(local);
                    await this.saveData();
                    console.log("Dados locais migrados para a nuvem.");
                } else {
                    this.data = DEFAULT_DATA;
                    await this.saveData();
                    console.log("Novo banco de dados criado na nuvem.");
                }
            }
        } catch (error) {
            console.error("Erro ao carregar do Firebase:", error);
            alert("Erro ao carregar dados da nuvem. Verifique sua internet.");
        }
    }

    async saveData() {
        try {
            await db.collection('appData').doc(this.docId).set(this.data);
            localStorage.setItem('futManagerData', JSON.stringify(this.data)); // Backup local
            this.renderAll();
        } catch (error) {
            console.error("Erro ao salvar no Firebase:", error);
            alert("Erro ao salvar dados na nuvem!");
        }
    }

    checkAuth() {
        const isAdmin = localStorage.getItem('resenha_admin') === 'true';
        document.body.classList.toggle('is-admin', isAdmin);
    }

    logout() {
        localStorage.removeItem('resenha_admin');
        this.checkAuth();
        this.renderAll();
    }

    renderAll() {
        if (!this.data) return;
        this.renderDashboard();
        this.renderPlayers();
        this.renderAttendance();
        this.renderFinance();
        this.renderCustomPushes();
    }

    bindEvents() {
        // Navigation (Desktop and Mobile)
        const navItems = document.querySelectorAll('.nav-item, .nav-item-mobile');
        navItems.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.dataset.target;
                if (!target) return;
                
                navItems.forEach(b => {
                    if (b.dataset.target === target) b.classList.add('active');
                    else b.classList.remove('active');
                });

                document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
                document.getElementById(target).classList.add('active');

                if (target === 'sorteio') this.updateSorteioPool();

                document.getElementById('page-title').textContent = e.currentTarget.textContent.trim();

                // Olhinho: so aparece no Dashboard para administradores logados
                const eyeBtn = document.getElementById('btn-toggle-finances');
                const isAdmin = localStorage.getItem('resenha_admin') === 'true';
                if (eyeBtn) {
                    eyeBtn.style.display = (target === 'dashboard' && isAdmin) ? 'inline-flex' : 'none';
                }
                
                if (window.innerWidth < 992) window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });

        // Form submits
        document.getElementById('player-form').addEventListener('submit', (e) => this.handlePlayerSubmit(e));
        document.getElementById('transaction-form').addEventListener('submit', (e) => this.handleTransactionSubmit(e));

        // Admin login
        document.getElementById('admin-login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const u = document.getElementById('admin-user').value;
            const p = document.getElementById('admin-pass').value;
            const err = document.getElementById('admin-login-error');
            
            const admin = this.data.adminSettings || DEFAULT_DATA.adminSettings;
            
            if (u === admin.user && p === admin.pass) {
                localStorage.setItem('resenha_admin', 'true');
                this.checkAuth();
                document.getElementById('login-modal').classList.remove('active');
                err.style.display = 'none';
                document.getElementById('admin-user').value = '';
                document.getElementById('admin-pass').value = '';
                this.renderAll();
            } else {
                err.style.display = 'block';
            }
        });
        
        // Attendance date change
        document.getElementById('match-date-select').addEventListener('change', () => {
            this.renderAttendance();
            this.renderDashboard();
        });
    }

    updateDate() {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const dateStr = new Date().toLocaleDateString('pt-BR', options);
        document.getElementById('current-date').textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }

    initMatchDate() {
        const dateInput = document.getElementById('match-date-select');
        if (!dateInput) return;

        const config = (this.data && this.data.config) || DEFAULT_DATA.config;
        const matchDay = config.matchDay !== undefined ? parseInt(config.matchDay, 10) : 3; // default: Wednesday (3)
        const rotationDay = config.rotationDay !== undefined ? parseInt(config.rotationDay, 10) : 4; // default: Thursday (4)
        const matchTime = config.matchTime || "21:00";

        const today = new Date();
        const dayOfWeek = today.getDay();

        // Calcular quantos dias somar para obter a data do jogo atual/próximo
        let daysUntilMatch = (matchDay - dayOfWeek + 7) % 7;

        // Se o dia do jogo for o mesmo dia da rotação, rotacionamos após o horário do jogo
        if (matchDay === rotationDay && dayOfWeek === matchDay) {
            const [matchHour, matchMin] = matchTime.split(':').map(Number);
            if (today.getHours() >= (matchHour || 21)) {
                daysUntilMatch = 7;
            }
        }

        let current = new Date(today);
        current.setDate(today.getDate() + daysUntilMatch);

        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, '0');
        const d = String(current.getDate()).padStart(2, '0');
        const value = `${y}-${m}-${d}`;
        
        dateInput.value = value;

        // Atualizar texto do próximo jogo no dashboard
        const dashNext = document.getElementById('dash-next-game');
        if (dashNext) {
            const weekdaysShort = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
            const dayLabel = weekdaysShort[matchDay];
            dashNext.textContent = `${dayLabel}, ${d}/${m} - ${matchTime}`;
        }
    }

    formatDateBR(dateString) {
        if (!dateString) return '';
        const parts = dateString.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateString;
    }

    getAttendanceStatus(date, playerId) {
        if (!this.data.attendance[date]) return 'doubt';
        // Garantir que o ID seja tratado como string para buscar no objeto de presenca
        const val = this.data.attendance[date][String(playerId)];
        if (val === true || val === 'present') return 'present';
        if (val === 'absent') return 'absent';
        return 'doubt';
    }

    renderDashboard() {
        const todosMensalistas = this.data.players.filter(p => p.type === 'mensalista');
        const mensalistasPagantes = todosMensalistas.filter(p => (p.position || '').toLowerCase().trim() !== 'goleiro');
        
        const totalMensalistas = todosMensalistas.length;
        const totalEsperados = mensalistasPagantes.length;
        const paid = mensalistasPagantes.filter(p => p.status === 'paid').length;
        
        document.getElementById('dash-total-mensalistas').textContent = totalMensalistas;
        document.getElementById('dash-pagantes').innerHTML = `${paid}<span class="sub-value">/${totalEsperados}</span>`;
        
        let balance = this.data.transactions.reduce((acc, t) => t.type === 'in' ? acc + t.amount : acc - t.amount, 0);
        document.getElementById('dash-caixa').textContent = `R$ ${balance.toFixed(2).replace('.', ',')}`;

        // Atualizar Listas de Presença no Dashboard
        const dateSelect = document.getElementById('match-date-select');
        const nextMatchDate = dateSelect.value;
        const attendanceMap = this.data.attendance[nextMatchDate] || {};

        let presentMensalistasHTML = '';
        let presentAvulsosHTML = '';
        let doubtHTML = '';
        let absentHTML = '';
        
        let presentMensalistasCount = 0;
        let presentAvulsosCount = 0;
        let doubtCount = 0;
        let absentCount = 0;

        this.getSortedPlayers().forEach(p => {
            const status = this.getAttendanceStatus(nextMatchDate, p.id);
            const badge = p.type === 'avulso' ? '<span style="font-size: 10px; color: var(--neon-purple); border: 1px solid var(--neon-purple); padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: 600;">Avulso</span>' : '';
            
            if (p.type === 'avulso' && status === 'doubt') return;

            let color = 'var(--neon-orange)';
            let iconHtml = '<i class="ph-fill ph-question" style="color: var(--neon-orange);"></i>';
            if (status === 'present') { 
                color = 'var(--neon-green)'; 
                iconHtml = '<i class="ph-fill ph-check-circle" style="color: var(--neon-green);"></i>'; 
            }
            else if (status === 'absent') { 
                color = 'var(--neon-red)'; 
                iconHtml = '<i class="ph-fill ph-x-circle" style="color: var(--neon-red);"></i>'; 
            }

            const posBadge = p.position ? `<span style="font-size: 10px; color: var(--neon-blue); border: 1px solid var(--neon-blue); padding: 1px 4px; border-radius: 4px; margin-left: 6px; font-weight: 600; vertical-align: middle;">${p.position}</span>` : '';

            const html = `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 8px; margin-bottom: 8px; border-left: 3px solid ${color}">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div class="act-avatar" style="width: 32px; height: 32px;"><i class="ph ph-user"></i></div>
                        <div>
                            <div style="font-weight: 500; line-height: 1.4;">
                                ${p.nickname || p.name || ''} ${posBadge} ${badge}
                            </div>
                            <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">${p.fullName || ''}</div>
                        </div>
                    </div>
                    <div style="font-size: 24px; display: flex; align-items: center;">${iconHtml}</div>
                </div>
            `;

            if (status === 'present') {
                if (p.type === 'mensalista') {
                    presentMensalistasHTML += html;
                    presentMensalistasCount++;
                } else {
                    presentAvulsosHTML += html;
                    presentAvulsosCount++;
                }
            }
            else if (status === 'doubt') { doubtHTML += html; doubtCount++; }
            else if (status === 'absent') { absentHTML += html; absentCount++; }
        });

        let finalPresentHTML = '';
        if (presentMensalistasCount > 0) {
            finalPresentHTML += `<div style="font-size: 11px; font-weight: bold; color: var(--text-muted); padding: 4px 0 8px 0; letter-spacing: 1px;">MENSALISTAS (${presentMensalistasCount})</div>`;
            finalPresentHTML += presentMensalistasHTML;
        }
        if (presentAvulsosCount > 0) {
            finalPresentHTML += `<div style="font-size: 11px; font-weight: bold; color: var(--neon-purple); padding: 8px 0 8px 0; letter-spacing: 1px;">AVULSOS (${presentAvulsosCount})</div>`;
            finalPresentHTML += presentAvulsosHTML;
        }
        const totalPresentCount = presentMensalistasCount + presentAvulsosCount;

        document.getElementById('dash-confirmed-list').innerHTML = finalPresentHTML || '<p style="color: var(--text-muted); font-size: 14px; padding: 12px;">Nenhum presente.</p>';
        document.getElementById('dash-pending-list').innerHTML = doubtHTML || '<p style="color: var(--text-muted); font-size: 14px; padding: 12px;">Nenhuma dúvida.</p>';
        document.getElementById('dash-absent-list').innerHTML = absentHTML || '<p style="color: var(--text-muted); font-size: 14px; padding: 12px;">Nenhum ausente.</p>';
        
        document.getElementById('dash-confirmed-count').textContent = totalPresentCount;
        document.getElementById('dash-pending-count').textContent = doubtCount;
        document.getElementById('dash-absent-count').textContent = absentCount;

        this.renderRanking();

        const recentList = document.getElementById('dash-recent-payments');
        recentList.innerHTML = '';
        
        const recentIn = [...this.data.transactions]
            .sort((a,b) => b.id - a.id)
            .filter(t => t.type === 'in')
            .slice(0, 4);
            
        recentIn.forEach(t => {
            recentList.innerHTML += `
                <li class="activity-item" style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%; gap: 12px; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <div class="act-info" style="display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 0;">
                        <div class="act-avatar" style="flex-shrink: 0;"><i class="ph ph-user"></i></div>
                        <div class="act-details" style="min-width: 0; flex: 1;">
                            <p style="margin: 0; font-weight: 600; font-size: 13px; line-height: 1.2; color: var(--text-main); word-break: break-word;">${t.description}</p>
                            <span style="font-size: 10px; opacity: 0.6; display: block; margin-top: 2px;">${this.formatDateBR(t.date)}</span>
                        </div>
                    </div>
                    <div class="act-amount sensitive-amount" style="font-weight: 700; font-size: 14px; white-space: nowrap; color: var(--neon-green); margin-top: 2px;">+ R$ ${t.amount.toFixed(2).replace('.', ',')}</div>
                </li>
            `;
        });
        
        this.renderFinancialSummaryChart();
    }

    renderFinancialSummaryChart() {
        const chartContainer = document.getElementById('financial-summary-chart');
        if (!chartContainer) return;

        let totalMensalistas = 0;
        let totalAvulsos = 0;
        let totalGastos = 0;

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        this.data.transactions.forEach(t => {
            const tDate = new Date(t.date + 'T12:00:00');
            if (tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear) {
                if (t.type === 'in') {
                    if (t.description.toLowerCase().includes('avulso')) {
                        totalAvulsos += t.amount;
                    } else {
                        totalMensalistas += t.amount;
                    }
                } else if (t.type === 'out') {
                    totalGastos += t.amount;
                }
            }
        });

        const totalEntradas = totalMensalistas + totalAvulsos;
        const maxVal = Math.max(totalMensalistas, totalAvulsos, totalGastos, 1);

        const percMensalistas = totalEntradas > 0 ? ((totalMensalistas / totalEntradas) * 100).toFixed(0) : 0;
        const percAvulsos = totalEntradas > 0 ? ((totalAvulsos / totalEntradas) * 100).toFixed(0) : 0;
        const percGastos = totalEntradas > 0 ? ((totalGastos / totalEntradas) * 100).toFixed(0) : 0;

        const hMensalistas = (totalMensalistas / maxVal) * 90; // max 90% height
        const hAvulsos = (totalAvulsos / maxVal) * 90;
        const hGastos = (totalGastos / maxVal) * 90;

        chartContainer.innerHTML = `
            <div style="display: flex; justify-content: space-around; align-items: flex-end; height: 100%; width: 100%; gap: 16px; padding-top: 30px;">
                <!-- Mensalistas -->
                <div style="display: flex; flex-direction: column; align-items: center; width: 30%; height: 100%; justify-content: flex-end;">
                    <span class="sensitive-amount" style="color: var(--neon-green); font-weight: 600; font-size: 14px; margin-bottom: 2px;">R$ ${totalMensalistas.toFixed(2).replace('.', ',')}</span>
                    <span style="font-size: 12px; color: var(--text-muted); font-weight: bold; margin-bottom: 8px;">${percMensalistas}%</span>
                    <div style="width: 100%; background: rgba(16, 185, 129, 0.2); border: 1px solid var(--neon-green); border-bottom: none; border-radius: 8px 8px 0 0; height: ${hMensalistas}%; min-height: 5px; transition: height 0.5s ease;"></div>
                    <span style="margin-top: 12px; font-size: 12px; color: var(--text-muted); font-weight: 500;">Mensalistas</span>
                </div>

                <!-- Avulsos -->
                <div style="display: flex; flex-direction: column; align-items: center; width: 30%; height: 100%; justify-content: flex-end;">
                    <span class="sensitive-amount" style="color: var(--neon-blue); font-weight: 600; font-size: 14px; margin-bottom: 2px;">R$ ${totalAvulsos.toFixed(2).replace('.', ',')}</span>
                    <span style="font-size: 12px; color: var(--text-muted); font-weight: bold; margin-bottom: 8px;">${percAvulsos}%</span>
                    <div style="width: 100%; background: rgba(59, 130, 246, 0.2); border: 1px solid var(--neon-blue); border-bottom: none; border-radius: 8px 8px 0 0; height: ${hAvulsos}%; min-height: 5px; transition: height 0.5s ease;"></div>
                    <span style="margin-top: 12px; font-size: 12px; color: var(--text-muted); font-weight: 500;">Avulsos</span>
                </div>

                <!-- Gastos -->
                <div style="display: flex; flex-direction: column; align-items: center; width: 30%; height: 100%; justify-content: flex-end;">
                    <span class="sensitive-amount" style="color: var(--neon-red); font-weight: 600; font-size: 14px; margin-bottom: 2px;">R$ ${totalGastos.toFixed(2).replace('.', ',')}</span>
                    <span style="font-size: 12px; color: var(--text-muted); font-weight: bold; margin-bottom: 8px;">${percGastos}%</span>
                    <div style="width: 100%; background: rgba(239, 68, 68, 0.2); border: 1px solid var(--neon-red); border-bottom: none; border-radius: 8px 8px 0 0; height: ${hGastos}%; min-height: 5px; transition: height 0.5s ease;"></div>
                    <span style="margin-top: 12px; font-size: 12px; color: var(--text-muted); font-weight: 500;">Gastos</span>
                </div>
            </div>
        `;
    }

    getSortedPlayers(filterDate = null) {
        return [...this.data.players]
            .filter(p => {
                // Se a data for null, mostramos todos (para a tabela de gestão)
                if (filterDate === null) return true;
                
                // Se o jogador é temporário (Avulso da Semana), só aparece se for a data dele
                if (p.isTemporary) {
                    return filterDate === p.validDate;
                }
                return true;
            })
            .sort((a, b) => {
                const nameA = (a.nickname || a.name || a.fullName || '').toLowerCase();
                const nameB = (b.nickname || b.name || b.fullName || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });
    }

    renderPlayers() {
        const tbody = document.getElementById('mensalistas-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        const sorted = this.getSortedPlayers();
        let mensalistas = sorted.filter(p => p.type === 'mensalista');
        
        // Apply Payment Filter
        if (this.playerPaymentFilter === 'paid') {
            mensalistas = mensalistas.filter(p => p.status === 'paid' || (p.position || '').toLowerCase().trim() === 'goleiro');
        } else if (this.playerPaymentFilter === 'pending') {
            mensalistas = mensalistas.filter(p => p.status !== 'paid' && (p.position || '').toLowerCase().trim() !== 'goleiro');
        }

        let countMensalista = 1;

        const renderRow = (p, rowNumber) => {
            let statusBadge = '';
            const isGoleiro = (p.position || '').toLowerCase().trim() === 'goleiro';

            if (isGoleiro) {
                statusBadge = '<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3)">Isento</span>';
            } else if (p.status === 'paid') {
                statusBadge = '<span class="badge badge-success">Pago</span>';
            } else {
                statusBadge = '<span class="badge badge-warning">Pendente</span>';
            }

            let paymentBtn = '';
            if (!isGoleiro) {
                paymentBtn = p.status !== 'paid' 
                    ? `<button class="action-btn" title="Registrar Pagamento" onclick="app.registerPayment('${p.id}')" style="color: var(--neon-green); font-size: 22px;"><i class="ph ph-money"></i></button>` 
                    : `<button class="action-btn" title="Mudar para Pendente" onclick="app.undoPayment('${p.id}')" style="color: var(--neon-orange); font-size: 22px;"><i class="ph ph-arrow-counter-clockwise"></i></button>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="#" style="color: var(--text-muted); font-weight: 700; font-size: 15px; width: 44px;">${rowNumber}</td>
                <td data-label="Jogador">
                    <div style="font-weight: 600; font-size: 16px; line-height: 1.2;">
                        ${p.nickname || p.name}
                    </div>
                    <div style="font-size: 11px; color: var(--text-muted); opacity: 0.7; margin-top: 2px;">${p.fullName || ''}</div>
                </td>
                <td data-label="Posição">${p.position}</td>
                <td data-label="Status">${statusBadge}</td>
                <td data-label="Ações" class="admin-only" style="text-align: right;">
                    ${localStorage.getItem('resenha_admin') === 'true' ? `
                    ${paymentBtn}
                    <button class="action-btn" title="Editar" onclick="app.openPlayerModal('${p.id}')" style="font-size:22px;"><i class="ph ph-pencil-simple"></i></button>
                    <button class="action-btn" title="Excluir" onclick="app.deletePlayer('${p.id}')" style="color:var(--neon-red);font-size:22px;"><i class="ph ph-trash"></i></button>` : ''}
                </td>
            `;
            return tr;
        };

        mensalistas.forEach(p => tbody.appendChild(renderRow(p, countMensalista++)));
    }

    renderAttendance() {
        const list = document.getElementById('attendance-list');
        if (!list) return;
        list.innerHTML = '';
        let presentCount = 0;

        const dateSelectElement = document.getElementById('match-date-select');
        const dateSelect = dateSelectElement ? dateSelectElement.value : new Date().toISOString().split('T')[0];
        
        if (!this.data.attendance[dateSelect]) {
            this.data.attendance[dateSelect] = {};
        }

        const sorted = this.getSortedPlayers(dateSelect);
        const mensalistas = sorted.filter(p => p.type === 'mensalista');
        const avulsos = sorted.filter(p => p.type === 'avulso');

        let doubtCount = 0;
        let absentCount = 0;

        const getCardHTML = (p) => {
            const status = this.getAttendanceStatus(dateSelect, p.id);
            if (status === 'present') presentCount++;
            if (status === 'doubt') doubtCount++;
            if (status === 'absent') absentCount++;

            const isGuest = p.isTemporary;
            
            return `
                <div class="player-card ${status}" id="card-player-${p.id}">
                    <div class="player-info" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                            <div class="act-avatar"><i class="ph ph-user"></i></div>
                            <div>
                                <div style="font-weight: 600; display: flex; align-items: center; gap: 6px; font-size: 15px;">
                                    ${p.nickname || p.name || p.fullName} 
                                    ${isGuest ? '<span style="font-size: 9px; color: var(--neon-blue); border: 1px solid var(--neon-blue); padding: 0 4px; border-radius: 4px; text-transform: uppercase;">Hoje</span>' : ''}
                                    ${p.type === 'avulso' && !isGuest ? '<span style="font-size: 9px; color: var(--neon-purple); border: 1px solid var(--neon-purple); padding: 0 4px; border-radius: 4px; text-transform: uppercase;">Fixo</span>' : ''}
                                </div>
                                <div style="font-size: 11px; color: var(--text-muted);">${p.position}</div>
                            </div>
                        </div>
                        <div class="card-actions" style="display: flex; gap: 4px; align-items: center;">
                            ${localStorage.getItem('resenha_admin') === 'true' ? `
                            ${(p.position || '').toLowerCase().trim() !== 'goleiro' ? `
                                <button class="action-btn" title="${p.status === 'paid' ? 'Mudar para Pendente' : 'Registrar Pagamento'}" 
                                        onclick="app.${p.status === 'paid' ? 'undoPayment' : 'registerPayment'}('${p.id}')" 
                                        style="padding: 4px; font-size: 16px; color: ${p.status === 'paid' ? 'var(--neon-orange)' : 'var(--neon-green)'}; opacity: 0.8;">
                                    <i class="ph ${p.status === 'paid' ? 'ph-arrow-counter-clockwise' : 'ph-money'}"></i>
                                </button>
                            ` : ''}
                            <button class="action-btn" onclick="app.openPlayerModal('${p.id}')" style="padding: 4px; font-size: 16px; color: var(--text-muted); opacity: 0.6;"><i class="ph ph-pencil-simple"></i></button>
                            <button class="action-btn" onclick="app.deletePlayer('${p.id}')" style="padding: 4px; font-size: 16px; color: var(--neon-red); opacity: 0.6;"><i class="ph ph-trash"></i></button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="attendance-controls" style="display: flex; gap: 4px; background: rgba(0,0,0,0.2); padding: 4px; border-radius: 8px; margin-top: 8px;">
                        <button class="att-btn ${status === 'present' ? 'active-green' : ''}" onclick="app.setAttendance('${dateSelect}', '${p.id}', 'present')" title="Presente" style="color: var(--neon-green); opacity: ${status === 'present' ? '1' : '0.4'};">
                            <i class="ph-fill ph-check-circle"></i>
                        </button>
                        <button class="att-btn ${status === 'doubt' ? 'active-orange' : ''}" onclick="app.setAttendance('${dateSelect}', '${p.id}', 'doubt')" title="Dúvida" style="color: var(--neon-orange); opacity: ${status === 'doubt' ? '1' : '0.4'};">
                            <i class="ph-fill ph-question"></i>
                        </button>
                        <button class="att-btn ${status === 'absent' ? 'active-red' : ''}" onclick="app.setAttendance('${dateSelect}', '${p.id}', 'absent')" title="Ausente" style="color: var(--neon-red); opacity: ${status === 'absent' ? '1' : '0.4'};">
                            <i class="ph-fill ph-x-circle"></i>
                        </button>
                    </div>
                </div>
            `;
        };

        if (mensalistas.length > 0) {
            list.innerHTML += `<div style="font-size: 11px; font-weight: bold; color: var(--text-muted); padding: 4px 0; letter-spacing: 1.5px; width: 100%; text-transform: uppercase;">Mensalistas (${mensalistas.length})</div>`;
            mensalistas.forEach(p => list.innerHTML += getCardHTML(p));
        }

        if (avulsos.length > 0) {
            list.innerHTML += `<div style="font-size: 11px; font-weight: bold; color: var(--neon-purple); padding: 16px 0 4px 0; letter-spacing: 1.5px; width: 100%; text-transform: uppercase;">Avulsos (${avulsos.length})</div>`;
            avulsos.forEach(p => list.innerHTML += getCardHTML(p));
        }

        const countEl = document.getElementById('presenca-count');
        if (countEl) countEl.textContent = presentCount;

        const absentCountEl = document.getElementById('absent-count');
        if (absentCountEl) absentCountEl.textContent = absentCount;

        const doubtCountEl = document.getElementById('doubt-count');
        if (doubtCountEl) doubtCountEl.textContent = doubtCount;
        
        // Sincroniza com o Dashboard se necessário
        const dashCount = document.getElementById('dash-confirmed-count');
        if (dashCount) dashCount.textContent = presentCount;

        const dashDoubtCount = document.getElementById('dash-pending-count');
        if (dashDoubtCount) dashDoubtCount.textContent = doubtCount;

        const dashAbsentCount = document.getElementById('dash-absent-count');
        if (dashAbsentCount) dashAbsentCount.textContent = absentCount;
    }

    setAttendance(date, playerId, status) {
        if (!this.data.attendance[date]) this.data.attendance[date] = {};
        this.data.attendance[date][playerId] = status;
        this.saveData(); 
    }

    copyAttendanceToWhatsApp() {
        const dateSelect = document.getElementById('match-date-select');
        const dateValue = dateSelect.value;
        const dateText = this.getSelectedMatchDateText();
        
        let present = [];
        let absent = [];

        this.getSortedPlayers().forEach(p => {
            const status = this.getAttendanceStatus(dateValue, p.id);
            const line = `${p.nickname || p.fullName} ${p.type === 'avulso' ? '(Avulso)' : ''}`.trim();
            
            if (status === 'present') present.push(line);
            else if (status === 'absent') absent.push(line);
        });

        // Garantir que as configurações existam
        if (!this.data.config) this.data.config = {};
        const config = this.data.config;

        let parts = [];

        // 1. Título Fixo da Lista
        parts.push(`⚽ *RESENHA F.C - Lista de Presença*`);

        // 2. Data da Partida (se ativa)
        const includeDate = config.includeDate !== false;
        if (includeDate) {
            parts.push(`📅 Data: ${dateText}`);
        }

        // 3. Texto Adicional / PIX (editado pelo usuário)
        const customMessage = config.attendanceCustomMessage || '';
        if (customMessage.trim()) {
            // Determinar se é semana de pagamento e se o aviso está ativo
            const includeWarning = config.includeWarning !== false;
            const [year, month, dayStr] = dateValue.split('-');
            const dayNum = parseInt(dayStr, 10);
            const dateObj = new Date(year, parseInt(month) - 1, dayNum);
            
            let warningText = '';
            if (includeWarning && dateObj.getDay() === 3 && dayNum <= 7) {
                warningText = `⚠️🚨 *Semana de pagamento do mensal* 🚨⚠️\n\n`;
            }
            parts.push(warningText + customMessage);
        }

        const mensalistas = this.data.players.filter(p => p.type === 'mensalista');
        const totalM = mensalistas.length;

        // 4. Lista de Presentes (se ativa)
        const includePresent = config.includePresent !== false;
        if (includePresent) {
            let presentListStr = `✅ *Presentes (${present.length})*`;
            present.forEach((name, idx) => {
                presentListStr += `\n${idx + 1}. ${name}`;
            });
            // Adiciona exatamente uma linha em branco para o próximo se inscrever
            presentListStr += `\n${present.length + 1}.`;
            parts.push(presentListStr);
        }

        // 5. Lista de Espera (se ativa)
        const includeWaiting = config.includeWaiting !== false;
        if (includeWaiting) {
            let waitingListStr = `📋 *Lista de espera (avulsos)*`;
            for (let i = 1; i <= 5; i++) {
                waitingListStr += `\n${i}.`;
            }
            parts.push(waitingListStr);
        }

        // 6. Lista de Ausentes (se ativa)
        const includeAbsent = config.includeAbsent !== false;
        if (includeAbsent) {
            let absentListStr = `❌ *Ausentes (${absent.length})*`;
            absent.forEach((name, idx) => {
                absentListStr += `\n${idx + 1}. ${name}`;
            });
            // Adiciona exatamente uma linha em branco para o próximo se inscrever
            absentListStr += `\n${absent.length + 1}.`;
            parts.push(absentListStr);
        }

        let text = parts.join('\n\n');

        const copyFallback = (t) => {
            const textArea = document.createElement("textarea");
            textArea.value = t;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                alert('Lista copiada com sucesso! Cole no seu grupo do WhatsApp.');
            } catch (err) {
                alert('Erro ao copiar.');
            }
            document.body.removeChild(textArea);
        };

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                alert('Lista copiada com sucesso! Cole no seu grupo do WhatsApp.');
            }).catch(() => copyFallback(text));
        } else {
            copyFallback(text);
        }
    }

    copyDoubtListToWhatsApp() {
        const dateSelect = document.getElementById('match-date-select');
        const dateValue = dateSelect ? dateSelect.value : new Date().toISOString().split('T')[0];
        const dateText = this.getSelectedMatchDateText();
        
        let doubt = [];

        this.getSortedPlayers(dateValue).forEach(p => {
            const status = this.getAttendanceStatus(dateValue, p.id);
            if (status === 'doubt') {
                const name = (p.nickname || p.name || p.fullName).trim();
                const phone = p.phone ? p.phone.replace(/\D/g, '') : '';
                doubt.push({ name, phone });
            }
        });

        if (doubt.length === 0) {
            alert('Não há jogadores pendentes para cobrar!');
            return;
        }

        let text = `⚠️ *RESENHA F.C - Pendentes* ⚠️\n📅 Data: ${dateText}\n\n`;
        text += `Pessoal, favor confirmar presença ou ausência o quanto antes:\n\n`;
        text += `❓ *Dúvidas (${doubt.length})*\n`;
        doubt.forEach((player, index) => { 
            const mention = player.phone ? ` @${player.phone}` : '';
            text += `${index + 1}. ${player.name}${mention}\n`; 
        });

        const copyFallback = (t) => {
            const textArea = document.createElement("textarea");
            textArea.value = t;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                alert('Lista de dúvidas copiada! Cole no WhatsApp para cobrar o pessoal.');
            } catch (err) {
                alert('Erro ao copiar.');
            }
            document.body.removeChild(textArea);
        };

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                alert('Lista de dúvidas copiada! Cole no WhatsApp para cobrar o pessoal.');
            }).catch(() => copyFallback(text));
        } else {
            copyFallback(text);
        }
    }

    renderFinance() {
        const tbody = document.getElementById('financeiro-tbody');
        tbody.innerHTML = '';
        
        let balance = 0;
        
        const sortedTransactions = [...this.data.transactions].sort((a,b) => b.id - a.id);

        sortedTransactions.forEach(t => {
            if(t.type === 'in') balance += t.amount;
            else balance -= t.amount;
            
            const isInc = t.type === 'in';
            const typeStr = isInc ? '<span style="color: var(--neon-green)"><i class="ph ph-arrow-down"></i> Entrada</span>' : '<span style="color: var(--neon-red)"><i class="ph ph-arrow-up"></i> Saída</span>';
            const valStr = isInc ? `+ R$ ${t.amount.toFixed(2).replace('.', ',')}` : `- R$ ${t.amount.toFixed(2).replace('.', ',')}`;
            
            tbody.innerHTML += `
                <tr>
                    <td data-label="Data">${this.formatDateBR(t.date)}</td>
                    <td data-label="Descrição">${t.description}</td>
                    <td data-label="Tipo">${typeStr}</td>
                    <td data-label="Valor" class="sensitive-amount" style="font-weight: 600; color: ${isInc ? 'var(--neon-green)' : 'var(--text-main)'}">${valStr}</td>
                    <td data-label="Ações" style="text-align: right;">
                        <button class="action-btn" onclick="app.editTransactionModal('${t.id}')" style="font-size:22px;"><i class="ph ph-pencil-simple"></i></button>
                        <button class="action-btn" onclick="app.deleteTransaction('${t.id}')" style="color: var(--neon-red); font-size:22px;"><i class="ph ph-trash"></i></button>
                    </td>
                </tr>
            `;
        });

        document.getElementById('fin-balance').textContent = `R$ ${balance.toFixed(2).replace('.', ',')}`;

        // Atualiza os campos de configuração se existirem
        const mensalInput = document.getElementById('config-mensal');
        const avulsoInput = document.getElementById('config-avulso');
        if (mensalInput) mensalInput.value = this.data.config.mensalValue;
        if (avulsoInput) avulsoInput.value = this.data.config.avulsoValue;
    }

    saveConfig() {
        const mensal = parseFloat(document.getElementById('config-mensal').value);
        const avulso = parseFloat(document.getElementById('config-avulso').value);
        
        if (!isNaN(mensal)) this.data.config.mensalValue = mensal;
        if (!isNaN(avulso)) this.data.config.avulsoValue = avulso;
        
        this.saveData();
    }

    async shareDashboard() {
        if (typeof htmlToImage === 'undefined') {
            alert('Aguarde o carregamento do sistema e tente novamente.');
            return;
        }

        // Focamos em toda a área principal para incluir Título, Data e o Dashboard inteiro
        const mainContent = document.querySelector('.main-content');
        
        const shareBtn = document.querySelector('button[title="Gerar Foto do Dashboard"]');
        let oldBtnHtml = '';
        if(shareBtn) {
            oldBtnHtml = shareBtn.innerHTML;
            shareBtn.innerHTML = '<i class="ph ph-hourglass"></i>';
        }

        // Antes da foto, garantimos que as listas estejam todas abertas, já que agora elas crescem infinitamente
        const collapsibles = mainContent.querySelectorAll('.dash-collapsible');
        collapsibles.forEach(c => {
            c.classList.remove('collapsed');
            const icon = c.previousElementSibling?.querySelector('i:last-child');
            if(icon) {
                icon.classList.remove('ph-caret-down');
                icon.classList.add('ph-caret-up');
            }
        });

        // Expandir o ranking completo temporariamente para a foto
        const previousShowFullRanking = this.showFullRanking;
        this.showFullRanking = true;
        this.renderRanking();

        try {
            const blobPromise = new Promise(async (resolve, reject) => {
                try {
                    await new Promise(r => setTimeout(r, 150)); // Respiro para estabilizar o DOM expandido
                    
                    // Lemos o tamanho real da tela gigante para evitar cortes
                    const scrollWidth = mainContent.scrollWidth;
                    const scrollHeight = mainContent.scrollHeight;

                    // O motor de ouro (html-to-image) que traz cores vibrantes perfeitas
                    const dataUrl = await htmlToImage.toPng(mainContent, {
                        backgroundColor: '#0f172a',
                        pixelRatio: 2, // Resolução premium
                        skipFonts: true, // Ignora fontes para evitar travamentos de CORS
                        width: scrollWidth,
                        height: scrollHeight,
                        style: {
                            transform: 'scale(1)',
                            transformOrigin: 'top left'
                        }
                    });
                    
                    const res = await fetch(dataUrl);
                    const blob = await res.blob();
                    
                    if(shareBtn) shareBtn.innerHTML = oldBtnHtml;
                    resolve(blob);
                } catch(err) {
                    if(shareBtn) shareBtn.innerHTML = oldBtnHtml;
                    reject(err);
                }
            });

            const item = new ClipboardItem({ "image/png": blobPromise });
            await navigator.clipboard.write([item]);
            
            if (shareBtn) {
                shareBtn.innerHTML = '<i class="ph ph-check-circle" style="color: var(--neon-green)"></i>';
                setTimeout(() => { shareBtn.innerHTML = oldBtnHtml; }, 2000);
            }

        } catch(error) {
            console.error("Falha ao gerar ou copiar a foto: ", error);
            
            // Fallback: se o chrome bloquear o Ctrl+V, faz o download automático usando o motor perfeito
            try {
                const sw = mainContent.scrollWidth;
                const sh = mainContent.scrollHeight;
                const dataUrl = await htmlToImage.toPng(mainContent, {
                    backgroundColor: '#0f172a', pixelRatio: 1, skipFonts: true, width: sw, height: sh
                });
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `ResenhaFC_Dashboard.png`;
                a.click();
            } catch(e) {}

            if(shareBtn && shareBtn.innerHTML !== '<i class="ph ph-check-circle" style="color: var(--neon-green)"></i>') {
                shareBtn.innerHTML = oldBtnHtml;
            }
        } finally {
            // Restaura o ranking para o estado anterior
            this.showFullRanking = previousShowFullRanking;
            this.renderRanking();
        }
    }

    toggleDashList(id, headerEl) {
        const list = document.getElementById(id);
        const icon = headerEl.querySelector('i:last-child');
        
        if (list.classList.contains('collapsed')) {
            list.classList.remove('collapsed');
            if(icon) {
                icon.classList.remove('ph-caret-down');
                icon.classList.add('ph-caret-up');
            }
        } else {
            list.classList.add('collapsed');
            if(icon) {
                icon.classList.remove('ph-caret-up');
                icon.classList.add('ph-caret-down');
            }
        }
    }

    filterPlayers() {
        const term = document.getElementById('search-player').value.toLowerCase();
        const rows = document.querySelectorAll('#mensalistas-tbody tr');
        
        rows.forEach(row => {
            // Ignora a linha separadora de "AVULSOS"
            if(row.children.length === 1) return;
            
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    }

    /* Modals Logic */
    openModal(id) {
        document.getElementById(id).classList.add('active');
    }

    closeModal(id) {
        document.getElementById(id).classList.remove('active');
    }

    toggleFinances() {
        this.financesHidden = !this.financesHidden;
        const btn = document.getElementById('btn-toggle-finances');
        if (this.financesHidden) {
            document.body.classList.add('hide-finances');
            btn.innerHTML = '<i class="ph ph-eye-slash"></i>';
            
            if (document.getElementById('financeiro').classList.contains('active')) {
                document.querySelector('[data-target="dashboard"]').click();
            }
        } else {
            document.body.classList.remove('hide-finances');
            btn.innerHTML = '<i class="ph ph-eye"></i>';
        }
    }

    /* Player CRUD */
    openPlayerModal(id = null) {
        const form = document.getElementById('player-form');
        form.reset();
        this.editingPlayerId = id;
        
        if (id) {
            const player = this.data.players.find(p => p.id == id);
            document.getElementById('player-modal-title').textContent = "Editar Jogador";
            document.getElementById('player-id').value = player.id;
            document.getElementById('player-fullname').value = player.fullName || "";
            document.getElementById('player-nickname').value = player.nickname || "";
            document.getElementById('player-phone').value = player.phone || "";
            document.getElementById('player-position').value = player.position;
            document.getElementById('player-type').value = player.type;
            document.getElementById('player-status').value = player.status || 'unpaid';
            
            if (player.isTemporary) {
                document.getElementById('guest-match-date').value = player.validDate;
            }
        } else {
            document.getElementById('player-modal-title').textContent = "Adicionar Jogador";
            document.getElementById('player-id').value = "";
        }
        
        this.toggleGuestDateField();
        this.openModal('player-modal');
    }

    toggleGuestDateField() {
        const type = document.getElementById('player-type').value;
        const group = document.getElementById('guest-date-group');
        if (group) {
            group.style.display = type === 'avulso' ? 'block' : 'none';
            if (type === 'avulso') {
                const dateSelect = document.getElementById('match-date-select');
                document.getElementById('guest-match-date').value = dateSelect ? dateSelect.value : new Date().toISOString().split('T')[0];
            }
        }
    }

    handlePlayerSubmit(e) {
        e.preventDefault();
        const type = document.getElementById('player-type').value;
        const isGuest = type === 'avulso';
        
        const oldPlayer = this.editingPlayerId ? this.data.players.find(p => p.id == this.editingPlayerId) : null;
        const newStatus = document.getElementById('player-status').value;

        const playerData = {
            id: this.editingPlayerId || Date.now(),
            fullName: document.getElementById('player-fullname').value,
            nickname: document.getElementById('player-nickname').value,
            phone: document.getElementById('player-phone').value,
            position: document.getElementById('player-position').value,
            type: type,
            status: newStatus,
            isTemporary: isGuest,
            validDate: isGuest ? document.getElementById('guest-match-date').value : null
        };

        if (this.editingPlayerId) {
            const index = this.data.players.findIndex(p => p.id == this.editingPlayerId);
            this.data.players[index] = playerData;
            
            // Sincroniza financeiro se o status mudou via modal
            if (oldPlayer && oldPlayer.status !== newStatus) {
                if (newStatus === 'paid') this.registerPayment(playerData.id, true);
                else if (newStatus === 'unpaid') this.undoPayment(playerData.id, true);
            }
        } else {
            this.data.players.push(playerData);
            if (isGuest && playerData.validDate) {
                this.setAttendance(playerData.validDate, playerData.id, 'present');
            }
            // Se já cadastrar como pago, registra no financeiro
            if (newStatus === 'paid') {
                this.registerPayment(playerData.id, true);
            }
        }

        this.saveData();
        this.closeModal('player-modal');
        this.renderPlayers();
        this.updateDashboard();
        this.renderAttendance();
    }

    promptTemporaryPlayer() {
        this.openPlayerModal();
        // Força o tipo para 'avulso' e abre o campo de data
        const typeEl = document.getElementById('player-type');
        if (typeEl) {
            typeEl.value = 'avulso';
            this.toggleGuestDateField();
        }
        
        // Garante que a data do convidado é a data selecionada na lista
        const dateSelect = document.getElementById('match-date-select');
        const guestDateEl = document.getElementById('guest-match-date');
        if (dateSelect && guestDateEl) {
            guestDateEl.value = dateSelect.value;
        }
    }

    deletePlayer(id) {
        if(confirm('Tem certeza que deseja excluir este jogador?')) {
            this.data.players = this.data.players.filter(p => p.id != id);
            // Also clean up attendance for this player
            for (const date in this.data.attendance) {
                if (this.data.attendance[date][id]) {
                    delete this.data.attendance[date][id];
                }
            }
            this.saveData();
            this.renderPlayers();
            this.updateDashboard();
            this.renderAttendance();
        }
    }

    registerPayment(id, skipSave = false) {
        // Normaliza ID para string na busca para evitar erros de tipo (Number vs String)
        const player = this.data.players.find(p => String(p.id) === String(id));
        if(!player) return;
        
        // Evita duplicar transação se já estiver marcada como paga (proteção extra)
        // Só criamos a transação se o status estava pendente ou se for um fluxo forçado
        
        const amount = player.type === 'avulso' ? (this.data.config.avulsoValue || 0) : (this.data.config.mensalValue || 0);
        const descStr = player.type === 'avulso' ? 'Avulso' : 'Mensal';

        player.status = 'paid';
        const displayName = player.nickname && player.fullName && player.nickname !== player.fullName 
            ? `${player.nickname} (${player.fullName})` 
            : (player.nickname || player.fullName || 'Jogador');
        
        // Verifica se já não existe uma transação idêntica nas últimas 5 segundos (prevenção de duplo clique)
        const now = Date.now();
        const duplicate = this.data.transactions.find(t => t.playerId == id && t.type === 'in' && (now - t.id) < 5000);
        if (duplicate) return;

        // Adiciona ao financeiro
        this.data.transactions.push({
            id: now,
            date: new Date().toISOString().split('T')[0],
            description: `Pgto. ${descStr} - ${displayName}`,
            type: 'in',
            amount: amount,
            playerId: id
        });

        if (!skipSave) {
            this.saveData();
        }
    }

    undoPayment(id, skipSave = false) {
        const player = this.data.players.find(p => String(p.id) === String(id));
        if(!player) return;
        
        player.status = 'unpaid';
        
        // Remove a transação do financeiro associada a esse pagamento (a mais recente atrelada a ele)
        const txs = this.data.transactions;
        for (let i = txs.length - 1; i >= 0; i--) {
            if (String(txs[i].playerId) === String(id) && txs[i].type === 'in') {
                txs.splice(i, 1);
                break;
            }
        }

        if (!skipSave) {
            this.saveData();
        }
    }

    resetMonth() {
        if(confirm('Atenção: Isso vai mudar o status de todos os jogadores para "Pendente" para começar um novo mês. Deseja continuar?')) {
            this.data.players.forEach(p => p.status = 'unpaid');
            this.saveData();
            alert('Mês virado! Todos os status foram zerados para o novo mês.');
        }
    }

    /* Transaction CRUD */
    openTransactionModal(type = 'in', id = null) {
        const form = document.getElementById('transaction-form');
        form.reset();
        
        if (id) {
            const t = this.data.transactions.find(x => x.id == id);
            document.getElementById('transaction-modal-title').textContent = "Editar Transação";
            document.getElementById('transaction-id').value = t.id;
            document.getElementById('transaction-date').value = t.date;
            document.getElementById('transaction-desc').value = t.description;
            document.getElementById('transaction-type').value = t.type;
            document.getElementById('transaction-amount').value = t.amount;
        } else {
            document.getElementById('transaction-modal-title').textContent = "Nova Transação";
            document.getElementById('transaction-id').value = "";
            document.getElementById('transaction-type').value = type;
            document.getElementById('transaction-date').value = new Date().toISOString().split('T')[0];
        }
        this.openModal('transaction-modal');
    }

    editTransactionModal(id) {
        this.openTransactionModal(null, id);
    }

    handleTransactionSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('transaction-id').value;
        const transaction = {
            id: id ? parseInt(id) : Date.now(),
            date: document.getElementById('transaction-date').value,
            description: document.getElementById('transaction-desc').value,
            type: document.getElementById('transaction-type').value,
            amount: parseFloat(document.getElementById('transaction-amount').value)
        };

        if (id) {
            const index = this.data.transactions.findIndex(t => t.id === parseInt(id));
            this.data.transactions[index] = transaction;
        } else {
            this.data.transactions.push(transaction);
        }

        this.saveData();
        this.closeModal('transaction-modal');
        this.renderFinance();
        this.updateDashboard();
    }

    deleteTransaction(id) {
        if(confirm('Tem certeza que deseja excluir esta transação?')) {
            this.data.transactions = this.data.transactions.filter(t => t.id != id);
            this.saveData();
            this.renderFinance();
            this.updateDashboard();
        }
    }
    /* Team Draw Logic */
    updateSorteioPool() {
        const dateSelect = document.getElementById('match-date-select');
        const date = dateSelect ? dateSelect.value : new Date().toISOString().split('T')[0];
        const pool = document.getElementById('sorteio-pool');
        if (!pool) return;
        
        let confirmed = [];
        this.getSortedPlayers(date).forEach(p => {
            if (this.getAttendanceStatus(date, p.id) === 'present') {
                confirmed.push(p);
            }
        });

        if (confirmed.length === 0) {
            if (document.getElementById('sorteio-count')) document.getElementById('sorteio-count').textContent = '0';
            pool.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center;">Nenhum jogador confirmado para esta data.</p>';
            return;
        }

        if (document.getElementById('sorteio-count')) {
            const selectedCount = confirmed.filter(p => this.drawSelections.has(String(p.id))).length;
            document.getElementById('sorteio-count').innerHTML = `<span style="color: var(--neon-green); font-weight: bold;">${selectedCount}</span> de ${confirmed.length}`;
        }

        pool.innerHTML = confirmed.map(p => {
            const pid = String(p.id);
            const isGoleiro = (p.position || '').toLowerCase().trim() === 'goleiro';
            const isSelected = this.drawSelections.has(pid);
            return `
                <div class="glass-card draw-player-card ${isSelected ? 'selected' : ''}" 
                     onclick="app.toggleDrawSelection('${pid}')"
                     style="padding: 10px; font-size: 13px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; transition: all 0.2s; border: 2px solid ${isSelected ? 'var(--neon-green)' : 'rgba(255,255,255,0.15)'}; background: ${isSelected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.03)'}; transform: ${isSelected ? 'scale(1.02)' : 'scale(1)'};">
                    <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                        <i class="ph ${isGoleiro ? 'ph-hand-fist' : 'ph-user'}" style="color: ${isGoleiro ? 'var(--neon-blue)' : (isSelected ? 'var(--neon-green)' : 'var(--text-muted)')}"></i>
                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; ${isSelected ? 'font-weight: 800; color: #fff;' : ''}">${p.nickname || p.name}</span>
                    </div>
                    ${isSelected ? '<i class="ph-bold ph-check" style="color: var(--neon-green); font-size: 18px;"></i>' : '<i class="ph ph-square" style="color: var(--text-muted); opacity: 0.5; font-size: 18px;"></i>'}
                </div>
            `;
        }).join('');
    }

    toggleDrawSelection(playerId) {
        const pid = String(playerId);
        if (this.drawSelections.has(pid)) {
            this.drawSelections.delete(pid);
        } else {
            this.drawSelections.add(pid);
        }
        this.updateSorteioPool();
    }

    selectAllForDraw(shouldSelectAll = true) {
        const dateSelect = document.getElementById('match-date-select');
        const date = dateSelect ? dateSelect.value : new Date().toISOString().split('T')[0];
        
        // Feedback visual no ícone do botão
        const iconId = shouldSelectAll ? 'btn-icon-select-all' : 'btn-icon-deselect-all';
        const iconEl = document.getElementById(iconId);
        if (iconEl) {
            iconEl.className = shouldSelectAll ? 'ph ph-check-square' : 'ph ph-x-square';
            setTimeout(() => {
                iconEl.className = 'ph ph-square';
            }, 800);
        }

        if (!shouldSelectAll) {
            this.drawSelections.clear();
        } else {
            this.getSortedPlayers(date).forEach(p => {
                if (this.getAttendanceStatus(date, p.id) === 'present') {
                    this.drawSelections.add(String(p.id));
                }
            });
        }
        this.updateSorteioPool();
    }

    drawTeams() {
        const date = document.getElementById('match-date-select').value;
        const numTeamsInput = document.getElementById('num-teams');
        const numTeams = numTeamsInput ? parseInt(numTeamsInput.value) : 4;
        
        let confirmed = [];
        this.getSortedPlayers(date).forEach(p => {
            // Agora só entram no sorteio os que estão PRESENTES e SELECIONADOS (V)
            const pid = String(p.id);
            if (this.getAttendanceStatus(date, pid) === 'present' && this.drawSelections.has(pid)) {
                confirmed.push(p);
            }
        });

        if (confirmed.length === 0) {
            alert('Selecione os jogadores (clique nos nomes) que estão na quadra para realizar o sorteio.');
            return;
        }

        if (confirmed.length < numTeams) {
            alert(`Você selecionou apenas ${confirmed.length} jogadores. Precisa de pelo menos ${numTeams} para sortear ${numTeams} times.`);
            return;
        }

        // Lógica de Sorteio Balanceado (Society)
        const positions = {
            goleiros: confirmed.filter(p => (p.position || '').toLowerCase().trim() === 'goleiro'),
            zagueiros: confirmed.filter(p => (p.position || '').toLowerCase().includes('zaga') || (p.position || '') === 'Defensor'),
            laterais: confirmed.filter(p => (p.position || '').toLowerCase() === 'lateral' || (p.position || '').toLowerCase() === 'ala'),
            meios: confirmed.filter(p => (p.position || '').toLowerCase().includes('meio') || (p.position || '').toLowerCase() === 'meia' || (p.position || '').toLowerCase() === 'volante'),
            atacantes: confirmed.filter(p => (p.position || '').toLowerCase() === 'atacante' || (p.position || '').toLowerCase() === 'pivô'),
            outros: confirmed.filter(p => {
                const pos = (p.position || '').toLowerCase().trim();
                return pos !== 'goleiro' && !pos.includes('zaga') && pos !== 'defensor' && pos !== 'lateral' && pos !== 'ala' && !pos.includes('meio') && pos !== 'meia' && pos !== 'volante' && pos !== 'atacante' && pos !== 'pivô';
            })
        };

        const shuffle = (array) => {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
        };

        Object.values(positions).forEach(shuffle);

        const teams = Array.from({ length: numTeams }, () => []);
        let currentTeamIdx = 0;

        const distribute = (players) => {
            players.forEach(p => {
                teams[currentTeamIdx].push(p);
                currentTeamIdx = (currentTeamIdx + 1) % numTeams;
            });
            shuffle(teams);
            currentTeamIdx = 0;
        };

        distribute(positions.goleiros);
        distribute(positions.zagueiros);
        distribute(positions.laterais);
        distribute(positions.meios);
        distribute(positions.atacantes);
        distribute(positions.outros);
        
        this.currentTeams = teams;

        const getPositionColor = (posStr) => {
            if (!posStr) return 'var(--text-muted)';
            const p = posStr.toLowerCase().trim();
            if (p === 'goleiro') return 'var(--neon-blue)';
            if (p.includes('zaga') || p === 'defensor') return 'var(--neon-purple)';
            if (p === 'lateral' || p === 'ala') return 'var(--neon-orange)';
            if (p.includes('meio') || p === 'meia' || p === 'volante') return 'var(--neon-green)';
            if (p === 'atacante' || p === 'pivô' || p === 'centroavante') return 'var(--neon-red)';
            return 'var(--text-muted)';
        };
        
        const results = document.getElementById('sorteio-results');
        if (results) {
            results.innerHTML = teams.map((team, i) => {
                const sortedTeam = [...team].sort((a, b) => {
                    const posA = (a.position || 'Z').toLowerCase();
                    const posB = (b.position || 'Z').toLowerCase();
                    const weight = { 'goleiro': 1, 'zagueiro': 2, 'lateral': 3, 'meio-campo': 4, 'atacante': 5 };
                    return (weight[posA] || 6) - (weight[posB] || 6);
                });

                return `
                <div class="widget glass-card">
                    <h3 style="color: var(--neon-orange); margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                        Time ${i + 1} 
                        <span style="font-size: 14px; color: var(--text-muted); background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 12px;">${team.length} jogadores</span>
                    </h3>
                    <ul style="list-style: none; padding: 0; display: flex; flex-direction: column; gap: 8px;">
                        ${sortedTeam.map(p => {
                            const posColor = getPositionColor(p.position);
                            const isGoleiro = p.position && p.position.toLowerCase().trim() === 'goleiro';
                            return `<li style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 14px; color: ${isGoleiro ? 'var(--neon-blue)' : 'var(--text-light)'}; ${isGoleiro ? 'font-weight: bold;' : ''}">
                                <span><i class="ph ${isGoleiro ? 'ph-hand-fist' : 'ph-soccer-ball'}"></i> ${p.nickname || p.name || p.fullName || 'Sem Nome'}</span>
                                <span style="font-size: 11px; color: ${posColor}; border: 1px solid ${posColor}; padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.2); font-weight: 500;">${p.position || 'Sem Posição'}</span>
                            </li>`;
                        }).join('')}
                    </ul>
                </div>
                `;
            }).join('');
        }
    }

    copyTeamsToWhatsApp() {
        if (!this.currentTeams || this.currentTeams.length === 0) {
            alert('Sorteie os times primeiro!');
            return;
        }

        const dateSelect = document.getElementById('match-date-select');
        const dateText = this.getSelectedMatchDateText();
        
        let text = `⚽ *SORTEIO DE TIMES - RESENHA F.C* ⚽\n📅 ${dateText}\n\n`;
        
        this.currentTeams.forEach((team, i) => {
            text += `*Time ${i + 1}* (${team.length} jogadores)\n`;
            
            const sortedTeam = [...team].sort((a, b) => {
                const posA = (a.position || 'Z').toLowerCase();
                const posB = (b.position || 'Z').toLowerCase();
                const weight = { 'goleiro': 1, 'zagueiro': 2, 'lateral': 3, 'meio-campo': 4, 'atacante': 5 };
                return (weight[posA] || 6) - (weight[posB] || 6);
            });

            sortedTeam.forEach(p => {
                text += `👤 ${p.nickname || p.name} - ${p.position || 'Linha'}\n`;
            });
            text += `\n`;
        });

        navigator.clipboard.writeText(text).then(() => {
            alert('Times copiados!');
        });
    }

    renderRanking() {
        const rankingContainer = document.getElementById('dash-ranking-list');
        if (!rankingContainer) return;

        const scores = {};
        
        // 1. Contabilizar presenças de todo o histórico
        Object.keys(this.data.attendance).forEach(date => {
            const dayData = this.data.attendance[date];
            Object.keys(dayData).forEach(playerId => {
                const status = dayData[playerId];
                if (status === true || status === 'present') {
                    scores[playerId] = (scores[playerId] || 0) + 1;
                }
            });
        });

        // 2. Associar nomes aos IDs e ordenar (Critério: Pontos DESC, Nome ASC)
        const ranking = this.data.players
            .map(p => ({
                name: p.nickname || p.name,
                fullName: p.fullName,
                score: scores[p.id] || 0
            }))
            .filter(item => item.score > 0)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.name.localeCompare(b.name);
            });

        // Exibir contêiner de expansão apenas se houver mais de 10 itens
        const toggleContainer = document.getElementById('dash-ranking-toggle-container');
        if (toggleContainer) {
            if (ranking.length > 10) {
                toggleContainer.style.display = 'block';
                const btn = document.getElementById('btn-toggle-ranking');
                if (btn) {
                    if (this.showFullRanking) {
                        btn.innerHTML = '<i class="ph ph-eye-slash"></i> Ver Menos';
                    } else {
                        btn.innerHTML = '<i class="ph ph-eye"></i> Ver Mais';
                    }
                }
            } else {
                toggleContainer.style.display = 'none';
            }
        }

        const itemsToShow = this.showFullRanking ? ranking : ranking.slice(0, 10);

        // 3. Renderizar
        rankingContainer.innerHTML = itemsToShow.length ? itemsToShow.map((item, index) => {
            let rankLabel = `${index + 1}º`;
            let color = 'var(--text-muted)';
            
            if (index === 0) { rankLabel = 'TOP 1'; color = 'var(--neon-orange)'; }
            else if (index === 1) { rankLabel = 'TOP 2'; color = 'var(--neon-blue)'; }
            else if (index === 2) { rankLabel = 'TOP 3'; color = 'var(--neon-green)'; }

            return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="font-weight: 800; color: ${color}; font-size: 11px; letter-spacing: 0.5px; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; min-width: 48px; text-align: center;">${rankLabel}</div>
                    <div>
                        <div style="font-weight: 600; font-size: 14px;">${item.name}</div>
                        <div style="font-size: 10px; color: var(--text-muted);">${item.fullName || ''}</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 4px; color: ${color}; font-weight: 800;">
                    ${item.score} <span style="font-size: 12px; opacity: 0.6; font-weight: 400;">PTS</span>
                </div>
            </div>
            `;
        }).join('') : '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center; padding: 20px;">Nenhuma presença confirmada no histórico.</p>';
    }

    toggleRankingExpand() {
        this.showFullRanking = !this.showFullRanking;
        this.renderRanking();
    }

    getSelectedMatchDateText() {
        const dateInput = document.getElementById('match-date-select');
        if (!dateInput || !dateInput.value) return '';
        
        const [year, month, day] = dateInput.value.split('-');
        const dateObj = new Date(year, parseInt(month) - 1, day);
        
        const label = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
        const config = (this.data && this.data.config) || DEFAULT_DATA.config;
        const matchTime = config.matchTime || "21:00";
        return label.charAt(0).toUpperCase() + label.slice(1) + ` - ${matchTime}`;
    }

    /* Finance Search */
    filterTransactions() {
        const query = document.getElementById('search-finance').value.toLowerCase();
        const tbody = document.getElementById('financeiro-tbody');
        if (!tbody) return;
        
        const rows = tbody.getElementsByTagName('tr');
        for (let row of rows) {
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(query) ? '' : 'none';
        }
    }

    /* Payment Filters for Mensalistas View */
    setPlayerPaymentFilter(filter) {
        this.playerPaymentFilter = filter;
        
        // Update button states
        document.querySelectorAll('.player-filter-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.style.background = 'rgba(255, 255, 255, 0.03)';
            btn.style.color = 'var(--text-muted)';
            btn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        });

        const activeBtn = document.getElementById(`filter-${filter}`);
        if (activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.style.background = 'var(--neon-blue)';
            activeBtn.style.color = '#000';
            activeBtn.style.borderColor = 'var(--neon-blue)';
        }

        this.renderPlayers();
    }

    /* Share Defaulters (Monthly Payment List) */
    shareDefaulters() {
        const now = new Date();
        const monthName = now.toLocaleDateString('pt-BR', { month: 'long' });
        const year = now.getFullYear();
        
        const sortedPlayers = this.getSortedPlayers().filter(p => p.type === 'mensalista');
        const paid = sortedPlayers.filter(p => p.status === 'paid' || (p.position || '').toLowerCase().trim() === 'goleiro');
        const pending = sortedPlayers.filter(p => p.status !== 'paid' && (p.position || '').toLowerCase().trim() !== 'goleiro');
        
        let text = `💰 *RESENHA F.C - Mensalidade (${monthName.toUpperCase()} / ${year})* 💰\n\n`;
        
        text += `✅ *PAGOS (${paid.length})*\n`;
        paid.forEach((p, idx) => {
            text += `${idx + 1}. ${p.nickname || p.name}\n`;
        });

        text += `\n⏳ *PENDENTES (${pending.length})*\n`;
        pending.forEach((p, idx) => {
            const mention = p.phone ? ` @${p.phone.replace(/\D/g, '')}` : '';
            text += `${idx + 1}. ${p.nickname || p.name}${mention}\n`;
        });

        text += `\n*PIX PARA PAGAMENTO:*\n`;
        text += `*13997741390*\n`;
        text += `LEANDRO MORAES DA SILVA\n\n`;
        text += `_Favor regularizar para mantermos o caixa em dia! ⚽💰_`;

        const copyFallback = (t) => {
            const textArea = document.createElement("textarea");
            textArea.value = t;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                alert('Lista de mensalidades copiada! Cole no grupo do WhatsApp.');
            } catch (err) {
                alert('Erro ao copiar.');
            }
            document.body.removeChild(textArea);
        };

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                alert('Lista de mensalidades copiada! Cole no grupo do WhatsApp.');
            }).catch(() => copyFallback(text));
        } else {
            copyFallback(text);
        }
    }

    /* App Settings */
    updateAppIdentityPreview() {
        const nameInput = document.getElementById('config-app-name');
        const logoInput = document.getElementById('config-app-logo');
        const previewImg = document.getElementById('logo-preview');
        
        if (previewImg && logoInput.value) {
            previewImg.src = logoInput.value;
        }
    }

    handleLogoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 400; // Tamanho ideal para logotipo de alta qualidade e baixo peso
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                // Melhorar qualidade da redimensionamento
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                
                ctx.drawImage(img, 0, 0, width, height);

                // Converte para JPEG com 80% de qualidade (Equilíbrio perfeito entre peso e nitidez)
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
                
                document.getElementById('config-app-logo').value = compressedBase64;
                document.getElementById('logo-preview').src = compressedBase64;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    loadAppSettings() {
        const settings = this.data.appSettings || DEFAULT_DATA.appSettings;
        
        // Update Sidebar
        const sidebarLogo = document.getElementById('app-logo-sidebar');
        const sidebarName = document.getElementById('app-name-sidebar');
        if (sidebarLogo) sidebarLogo.src = settings.logo || 'resenha_logotipo.jpg';
        if (sidebarName) sidebarName.textContent = settings.name || 'RESENHA F.C';
        
        // Update Mobile
        const mobileLogo = document.getElementById('app-logo-mobile');
        const mobileName = document.getElementById('app-name-mobile');
        if (mobileLogo) mobileLogo.src = settings.logo || 'resenha_logotipo.jpg';
        if (mobileName) mobileName.textContent = settings.name || 'RESENHA F.C';

        // Update Inputs if in Settings View
        const nameInput = document.getElementById('config-app-name');
        const logoInput = document.getElementById('config-app-logo');
        const previewImg = document.getElementById('logo-preview');
        
        if (nameInput) nameInput.value = settings.name || 'RESENHA F.C';
        if (logoInput) logoInput.value = settings.logo || 'resenha_logotipo.jpg';
        if (previewImg) previewImg.src = settings.logo || 'resenha_logotipo.jpg';

        // Update Admin Settings Inputs
        const adminSettings = this.data.adminSettings || DEFAULT_DATA.adminSettings;
        const configUser = document.getElementById('config-admin-user');
        const configPass = document.getElementById('config-admin-pass');
        if (configUser) configUser.value = adminSettings.user;
        if (configPass) configPass.value = adminSettings.pass;

        // Update Attendance Msg & Checkboxes Input
        if (!this.data.config) this.data.config = {};
        
        // Custom message default fallback
        if (this.data.config.attendanceCustomMessage === undefined) {
            this.data.config.attendanceCustomMessage = DEFAULT_DATA.config.attendanceCustomMessage;
        }
        
        const templateMsgInput = document.getElementById('config-attendance-msg');
        if (templateMsgInput) templateMsgInput.value = this.data.config.attendanceCustomMessage;

        // Checkboxes defaults and updates
        const includeDateCb = document.getElementById('config-include-date');
        const includeWarningCb = document.getElementById('config-include-warning');
        const includePresentCb = document.getElementById('config-include-present');
        const includeWaitingCb = document.getElementById('config-include-waiting');
        const includeAbsentCb = document.getElementById('config-include-absent');

        if (includeDateCb) includeDateCb.checked = this.data.config.includeDate !== false;
        if (includeWarningCb) includeWarningCb.checked = this.data.config.includeWarning !== false;
        if (includePresentCb) includePresentCb.checked = this.data.config.includePresent !== false;
        if (includeWaitingCb) includeWaitingCb.checked = this.data.config.includeWaiting !== false;
        if (includeAbsentCb) includeAbsentCb.checked = this.data.config.includeAbsent !== false;

        // Match settings values
        const matchDayEl = document.getElementById('config-match-day');
        const matchTimeEl = document.getElementById('config-match-time');
        const rotationDayEl = document.getElementById('config-rotation-day');

        if (matchDayEl) matchDayEl.value = this.data.config.matchDay !== undefined ? this.data.config.matchDay : 3;
        if (matchTimeEl) matchTimeEl.value = this.data.config.matchTime || "21:00";
        if (rotationDayEl) rotationDayEl.value = this.data.config.rotationDay !== undefined ? this.data.config.rotationDay : 4;

        // Update Notification Settings
        if (!this.data.notifications) this.data.notifications = DEFAULT_DATA.notifications;
        const notifyOpenCb = document.getElementById('config-notify-open');
        
        if (notifyOpenCb) notifyOpenCb.checked = this.data.notifications.notifyOnOpen;
        
        const cb3 = document.getElementById('config-notify-day-3');
        const cb2 = document.getElementById('config-notify-day-2');
        const cb1 = document.getElementById('config-notify-day-1');
        
        if (cb3) cb3.checked = this.data.notifications.notifyDay3;
        if (cb2) cb2.checked = this.data.notifications.notifyDay2;
        if (cb1) cb1.checked = this.data.notifications.notifyDay1;

        if (this.data.notifications.templates) {
            const t = this.data.notifications.templates;
            if (document.getElementById('config-notify-title-3')) document.getElementById('config-notify-title-3').value = t.day3?.title || '';
            if (document.getElementById('config-notify-body-3')) document.getElementById('config-notify-body-3').value = t.day3?.body || '';
            if (document.getElementById('config-notify-title-2')) document.getElementById('config-notify-title-2').value = t.day2?.title || '';
            if (document.getElementById('config-notify-body-2')) document.getElementById('config-notify-body-2').value = t.day2?.body || '';
            if (document.getElementById('config-notify-title-1')) document.getElementById('config-notify-title-1').value = t.day1?.title || '';
            if (document.getElementById('config-notify-body-1')) document.getElementById('config-notify-body-1').value = t.day1?.body || '';
        }
    }

    async saveAppSettings() {
        const name = document.getElementById('config-app-name').value || "RESENHA F.C";
        const logo = document.getElementById('config-app-logo').value || "resenha_logotipo.jpg";
        
        this.data.appSettings = { name, logo };
        await this.saveData();
        this.loadAppSettings();
        alert('Identidade do clube salva! ✅');
    }

    async saveAttendanceTemplate() {
        const msg = document.getElementById('config-attendance-msg').value;
        const includeDate = document.getElementById('config-include-date').checked;
        const includeWarning = document.getElementById('config-include-warning').checked;
        const includePresent = document.getElementById('config-include-present').checked;
        const includeWaiting = document.getElementById('config-include-waiting').checked;
        const includeAbsent = document.getElementById('config-include-absent').checked;
        const matchDay = parseInt(document.getElementById('config-match-day').value, 10);
        const matchTime = document.getElementById('config-match-time').value.trim() || "21:00";
        const rotationDay = parseInt(document.getElementById('config-rotation-day').value, 10);

        if (!this.data.config) this.data.config = {};
        
        this.data.config.attendanceCustomMessage = msg;
        this.data.config.includeDate = includeDate;
        this.data.config.includeWarning = includeWarning;
        this.data.config.includePresent = includePresent;
        this.data.config.includeWaiting = includeWaiting;
        this.data.config.includeAbsent = includeAbsent;
        this.data.config.matchDay = matchDay;
        this.data.config.matchTime = matchTime;
        this.data.config.rotationDay = rotationDay;

        await this.saveData();
        this.initMatchDate();
        this.renderAttendance();
        this.renderDashboard();
        alert('Configuração da lista e cronograma salvas com sucesso! 📋📅✅');
    }

    async saveAdminSettings() {
        const user = document.getElementById('config-admin-user').value.trim();
        const pass = document.getElementById('config-admin-pass').value.trim();

        if (!user || !pass) {
            alert("Usuário e senha não podem estar vazios!");
            return;
        }

        if (confirm("Deseja realmente alterar os dados de acesso? Você precisará usar os novos dados no próximo login.")) {
            this.data.adminSettings = { user, pass };
            await this.saveData();
            alert("Dados de acesso atualizados com sucesso! 🛡️");
        }
    }

    async saveNotificationSettings() {
        const notifyOnOpen = document.getElementById('config-notify-open').checked;
        const notifyDay3 = document.getElementById('config-notify-day-3').checked;
        const notifyDay2 = document.getElementById('config-notify-day-2').checked;
        const notifyDay1 = document.getElementById('config-notify-day-1').checked;
        
        const templates = {
            day3: {
                title: document.getElementById('config-notify-title-3').value.trim(),
                body: document.getElementById('config-notify-body-3').value.trim()
            },
            day2: {
                title: document.getElementById('config-notify-title-2').value.trim(),
                body: document.getElementById('config-notify-body-2').value.trim()
            },
            day1: {
                title: document.getElementById('config-notify-title-1').value.trim(),
                body: document.getElementById('config-notify-body-1').value.trim()
            }
        };

        if (!this.data.notifications) this.data.notifications = {};
        
        this.data.notifications = {
            notifyOnOpen,
            notifyDay3,
            notifyDay2,
            notifyDay1,
            templates
        };

        await this.saveData();
        alert('Ajustes de notificações salvos com sucesso!');
    }

    async scheduleCustomPush() {
        const title = document.getElementById('custom-push-title').value.trim();
        const body = document.getElementById('custom-push-body').value.trim();
        const date = document.getElementById('custom-push-date').value;
        const time = document.getElementById('custom-push-time').value;
        const target = document.getElementById('custom-push-target').value;

        if (!title || !body || !date || !time) {
            alert('Preencha todos os campos do agendamento.');
            return;
        }

        if (!this.data.customPushes) this.data.customPushes = [];

        const scheduledFor = `${date}T${time}:00`;

        if (this.editingPushId) {
            const index = this.data.customPushes.findIndex(p => p.id === this.editingPushId);
            if (index !== -1) {
                this.data.customPushes[index].title = title;
                this.data.customPushes[index].body = body;
                this.data.customPushes[index].scheduledFor = scheduledFor;
                this.data.customPushes[index].target = target;
            }
        } else {
            const id = 'push_' + Date.now();
            this.data.customPushes.push({
                id,
                title,
                body,
                scheduledFor,
                target,
                createdAt: new Date().toISOString()
            });
        }

        await this.saveData();
        
        this.cancelEditCustomPush();
        this.renderCustomPushes();
        alert('Disparo agendado com sucesso!');
    }

    editCustomPush(id) {
        const push = (this.data.customPushes || []).find(p => p.id === id);
        if (!push) return;

        document.getElementById('custom-push-title').value = push.title || '';
        document.getElementById('custom-push-body').value = push.body || '';
        document.getElementById('custom-push-target').value = push.target || 'all';

        if (push.scheduledFor) {
            const [date, time] = push.scheduledFor.split('T');
            document.getElementById('custom-push-date').value = date || '';
            document.getElementById('custom-push-time').value = time.substring(0, 5) || '';
        }

        this.editingPushId = id;
        document.getElementById('custom-push-btn-text').textContent = 'Salvar Edição';
        document.getElementById('custom-push-cancel-btn').style.display = 'block';

        // Scroll animado suave para o título do campo
        document.getElementById('custom-push-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    cancelEditCustomPush() {
        this.editingPushId = null;
        document.getElementById('custom-push-title').value = '';
        document.getElementById('custom-push-body').value = '';
        document.getElementById('custom-push-date').value = '';
        document.getElementById('custom-push-time').value = '';
        document.getElementById('custom-push-target').value = 'all';

        const btnText = document.getElementById('custom-push-btn-text');
        if (btnText) btnText.textContent = 'Agendar Hora Exata';
        
        const cancelBtn = document.getElementById('custom-push-cancel-btn');
        if (cancelBtn) cancelBtn.style.display = 'none';
    }

    renderCustomPushes() {
        const list = document.getElementById('custom-push-list');
        if (!list) return;

        list.innerHTML = '';
        const pushes = this.data.customPushes || [];

        if (pushes.length === 0) {
            list.innerHTML = '<li style="color: var(--text-muted); font-size: 13px;">Nenhum agendamento pendente.</li>';
            return;
        }

        pushes.sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));

        pushes.forEach(p => {
            const dateObj = new Date(p.scheduledFor);
            const dateStr = dateObj.toLocaleDateString('pt-BR');
            const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            const targetStr = p.target === 'all' ? 'Todos' : 'Pendentes';

            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.background = 'rgba(255,255,255,0.02)';
            li.style.padding = '12px';
            li.style.borderRadius = '8px';
            li.style.border = '1px solid rgba(255,255,255,0.05)';

            li.innerHTML = `
                <div>
                    <strong style="color: var(--text-main); font-size: 14px;">${p.title}</strong>
                    <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
                        ${dateStr} às ${timeStr} • Alvo: ${targetStr}
                    </div>
                </div>
                <div style="display: flex; gap: 4px;">
                    <button onclick="app.editCustomPush('${p.id}')" style="background: transparent; border: none; color: var(--neon-blue); cursor: pointer; padding: 8px;">
                        <i class="ph ph-pencil-simple" style="font-size: 18px;"></i>
                    </button>
                    <button onclick="app.deleteCustomPush('${p.id}')" style="background: transparent; border: none; color: var(--neon-red); cursor: pointer; padding: 8px;">
                        <i class="ph ph-trash" style="font-size: 18px;"></i>
                    </button>
                </div>
            `;
            list.appendChild(li);
        });
    }

    async deleteCustomPush(id) {
        if (!confirm('Deseja excluir este agendamento?')) return;
        
        this.data.customPushes = this.data.customPushes.filter(p => p.id !== id);
        await this.saveData();
        this.renderCustomPushes();
    }

    toggleAdminPasswordVisibility() {
        const passInput = document.getElementById('config-admin-pass');
        const icon = document.getElementById('admin-pass-toggle-icon');
        if (passInput && icon) {
            if (passInput.type === 'password') {
                passInput.type = 'text';
                icon.classList.remove('ph-eye');
                icon.classList.add('ph-eye-slash');
            } else {
                passInput.type = 'password';
                icon.classList.remove('ph-eye-slash');
                icon.classList.add('ph-eye');
            }
        }
    }

    /* Menu Mais (Mobile) */
    toggleMoreMenu() {
        const overlay = document.getElementById('more-menu-overlay');
        if (overlay) overlay.classList.toggle('active');
    }

    goToView(target) {
        // Fechar o menu mais se estiver aberto
        const overlay = document.getElementById('more-menu-overlay');
        if (overlay) overlay.classList.remove('active');

        // Disparar o clique no botão de navegação correspondente (ou fazer manual)
        const navItem = document.querySelector(`.nav-item[data-target="${target}"], .nav-item-mobile[data-target="${target}"]`);
        if (navItem) {
            navItem.click();
        } else {
            // Fallback manual se não houver botão visível
            document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
            const section = document.getElementById(target);
            if (section) section.classList.add('active');
        }
    }

    initPullToRefresh() {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const ptr = document.createElement('div');
        ptr.id = 'ptr-indicator';
        ptr.style.cssText = 'position: absolute; top: -60px; left: 0; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; height: 60px; color: var(--text-muted); font-weight: 600; z-index: 100; opacity: 0; transition: opacity 0.2s;';
        ptr.innerHTML = '<i class="ph ph-arrow-down" id="ptr-icon" style="font-size: 20px; transition: transform 0.3s;"></i> <span id="ptr-text" style="font-size: 14px;">Puxe para atualizar</span>';
        
        mainContent.style.position = 'relative';
        mainContent.prepend(ptr);

        let startY = 0;
        let isPulling = false;
        const threshold = 70;
        const topbar = document.querySelector('.topbar');
        const contentWrapper = document.querySelector('.content-wrapper');

        mainContent.addEventListener('touchstart', (e) => {
            if (mainContent.scrollTop === 0) {
                startY = e.touches[0].clientY;
                isPulling = true;
                if(topbar) topbar.style.transition = 'none';
                if(contentWrapper) contentWrapper.style.transition = 'none';
                ptr.style.transition = 'none';
                ptr.style.opacity = '1';
            }
        }, { passive: true });

        mainContent.addEventListener('touchmove', (e) => {
            if (!isPulling) return;
            const currentY = e.touches[0].clientY;
            let pullDistance = currentY - startY;

            if (pullDistance > 0 && mainContent.scrollTop === 0) {
                const visualPull = Math.min(pullDistance * 0.4, 120);
                
                if(topbar) topbar.style.transform = `translateY(${visualPull}px)`;
                if(contentWrapper) contentWrapper.style.transform = `translateY(${visualPull}px)`;
                ptr.style.transform = `translateY(${visualPull}px)`;
                
                const ptrIcon = document.getElementById('ptr-icon');
                const ptrText = document.getElementById('ptr-text');
                
                if (visualPull >= threshold) {
                    if(ptrIcon) ptrIcon.style.transform = 'rotate(180deg)';
                    if(ptrText) ptrText.textContent = 'Solte para atualizar';
                } else {
                    if(ptrIcon) ptrIcon.style.transform = 'rotate(0deg)';
                    if(ptrText) ptrText.textContent = 'Puxe para atualizar';
                }
            } else {
                isPulling = false;
            }
        }, { passive: true });

        mainContent.addEventListener('touchend', async () => {
            if (!isPulling) return;
            isPulling = false;
            
            if(topbar) topbar.style.transition = 'transform 0.3s ease-out';
            if(contentWrapper) contentWrapper.style.transition = 'transform 0.3s ease-out';
            ptr.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';

            const transformMatch = topbar ? topbar.style.transform.match(/translateY\((.*?)px\)/) : null;
            const visualPull = transformMatch ? parseFloat(transformMatch[1]) : 0;

            if (visualPull >= threshold) {
                const ptrText = document.getElementById('ptr-text');
                const ptrIcon = document.getElementById('ptr-icon');
                
                if(ptrText) ptrText.textContent = 'Atualizando...';
                if(ptrIcon) {
                    ptrIcon.className = 'ph ph-spinner-gap ptr-spin';
                    ptrIcon.style.transform = 'rotate(0deg)';
                }
                
                if(topbar) topbar.style.transform = `translateY(60px)`;
                if(contentWrapper) contentWrapper.style.transform = `translateY(60px)`;
                ptr.style.transform = `translateY(60px)`;
                
                try {
                    await this.loadDataFromCloud();
                    this.renderAll();
                } catch(err) {
                    console.error(err);
                }

                setTimeout(() => {
                    const icon = document.getElementById('ptr-icon');
                    const text = document.getElementById('ptr-text');
                    if(icon) {
                        icon.className = 'ph ph-arrow-down';
                        icon.style.transform = 'rotate(0deg)';
                    }
                    if(text) text.textContent = 'Puxe para atualizar';
                    ptr.style.opacity = '0';
                    if(topbar) topbar.style.transform = `translateY(0)`;
                    if(contentWrapper) contentWrapper.style.transform = `translateY(0)`;
                    ptr.style.transform = `translateY(0)`;
                }, 500);

            } else {
                ptr.style.opacity = '0';
                if(topbar) topbar.style.transform = `translateY(0)`;
                if(contentWrapper) contentWrapper.style.transform = `translateY(0)`;
                ptr.style.transform = `translateY(0)`;
            }
        });
    }

    checkNotificationPermission() {
        const banner = document.getElementById('notification-banner');
        if (!banner) return;
        
        if (!('Notification' in window)) {
            banner.style.display = 'none';
            return;
        }

        if (Notification.permission === 'granted') {
            banner.style.display = 'flex';
            banner.style.borderColor = 'var(--neon-green)';
            banner.innerHTML = `
                <div style="display: flex; align-items: center; gap: 16px;">
                    <i class="ph ph-check-circle" style="font-size: 28px; color: var(--neon-green);"></i>
                    <div>
                        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--neon-green);">Notificações Ativas neste Aparelho</h3>
                        <p style="margin: 4px 0 0 0; font-size: 14px; color: var(--text-muted);">Tudo certo! Você receberá os avisos aqui.</p>
                    </div>
                </div>
            `;
            
            // Silent token registration if already granted
            try {
                const messaging = firebase.messaging();
                messaging.getToken({ vapidKey: 'BH4F-JK-x-WRnsk4W9L1bg70I7zTevMXgkKKdVHCo7XKR_mtXebB3Oyui5-LU6Aei22C4Ji_-lJgAPQAMQ_Vt6E' })
                    .then(async (token) => {
                        if (token) {
                            if (!this.data.globalTokens) this.data.globalTokens = [];
                            if (!this.data.globalTokens.includes(token)) {
                                this.data.globalTokens.push(token);
                                await this.saveData();
                                console.log("Token global registrado com sucesso no background.");
                            }
                        }
                    })
                    .catch(err => console.error("Silenced background token error", err));
            } catch(e){}
        } else if (Notification.permission === 'default') {
            banner.style.display = 'flex';
            banner.style.borderColor = 'var(--neon-blue)';
            banner.innerHTML = `
                <div style="display: flex; align-items: center; gap: 16px;">
                    <i class="ph ph-bell-ringing" style="font-size: 28px; color: var(--neon-blue);"></i>
                    <div>
                        <h3 style="margin: 0; font-size: 16px; font-weight: 600;">Ativar Notificações</h3>
                        <p style="margin: 4px 0 0 0; font-size: 14px; color: var(--text-muted);">Receba avisos dos próximos jogos e mensalidades direto no celular.</p>
                    </div>
                </div>
                <button class="btn" onclick="app.requestNotificationPermission()" style="background: var(--neon-blue); color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 15px rgba(59,130,246,0.4);">Ativar</button>
            `;
        } else {
            banner.style.display = 'none';
        }
    }

    async requestNotificationPermission() {
        if (!('Notification' in window)) {
            alert('Este navegador não suporta notificações.');
            return;
        }

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            try {
                const messaging = firebase.messaging();
                const token = await messaging.getToken({ vapidKey: 'BH4F-JK-x-WRnsk4W9L1bg70I7zTevMXgkKKdVHCo7XKR_mtXebB3Oyui5-LU6Aei22C4Ji_-lJgAPQAMQ_Vt6E' });
                
                if (token) {
                    if (!this.data.globalTokens) this.data.globalTokens = [];
                    if (!this.data.globalTokens.includes(token)) {
                        this.data.globalTokens.push(token);
                        await this.saveData();
                    }
                    this.checkNotificationPermission();
                    alert('Notificações ativadas com sucesso! 🔔');
                }
            } catch (err) {
                console.error('Erro ao obter token:', err);
                alert('Erro ao ativar notificações. O Google bloqueou a geração do código.\n\nDetalhe técnico: ' + err.message);
                this.checkNotificationPermission();
            }
        } else {
            alert('Permissão de notificação negada.');
            this.checkNotificationPermission();
        }
    }

    logout() {
        localStorage.removeItem('resenha_admin');
        this.checkAuth();
        
        // Fechar menus abertos
        const overlay = document.getElementById('more-menu-overlay');
        if (overlay) overlay.classList.remove('active');

        // Voltar para o Dashboard
        document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
        const dash = document.getElementById('dashboard');
        if (dash) dash.classList.add('active');
        
        const pageTitle = document.getElementById('page-title');
        if (pageTitle) pageTitle.textContent = 'Dashboard';
        
        // Resetar itens ativos na nav
        document.querySelectorAll('.nav-item, .nav-item-mobile').forEach(b => {
            if (b.dataset.target === 'dashboard') b.classList.add('active');
            else b.classList.remove('active');
        });

        this.renderAll();
        alert('Você saiu da conta com sucesso. 👋');
    }
}

const app = new FootballApp();
// Expose functions globally for inline HTML onclick handlers
window.app = app;
