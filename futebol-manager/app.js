const firebaseConfig = {
    apiKey: "AIzaSyBDrruu7PFK1xWJ8x77KaZSO-A1HxlRo1s",
    authDomain: "resenha-fc-3543b.firebaseapp.com",
    projectId: "resenha-fc-3543b",
    storageBucket: "resenha-fc-3543b.firebasestorage.app",
    messagingSenderId: "825293531934",
    appId: "1:825293531934:web:7f52316cabb168f4a5b70f"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const DEFAULT_DATA = {
    players: [],
    transactions: [],
    attendance: {},
    config: {
        mensalValue: 50.00,
        avulsoValue: 20.00
    }
};

class FootballApp {
    constructor() {
        this.data = DEFAULT_DATA;
        this.financesHidden = false;
        this.drawSelections = new Set();
        this.docId = 'mainData'; // Documento único no Firestore
        this.init();
    }

    async init() {
        this.bindEvents();
        this.updateDate();
        this.initMatchDate();
        await this.loadDataFromCloud();
        this.checkAuth();
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
        this.renderDashboard();
        this.renderPlayers();
        this.renderAttendance();
        this.renderFinance();
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
            if (u === 'kim' && p === '220688') {
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

        const today = new Date();
        let current = new Date(today);
        const dayOfWeek = current.getDay();
        let daysUntilWed = (3 + 7 - dayOfWeek) % 7;

        if (daysUntilWed === 0 && today.getHours() >= 21) {
            daysUntilWed = 7;
        }
        current.setDate(today.getDate() + daysUntilWed);

        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, '0');
        const d = String(current.getDate()).padStart(2, '0');
        const value = `${y}-${m}-${d}`;
        
        dateInput.value = value;

        // Atualizar texto do próximo jogo no dashboard
        const dashNext = document.getElementById('dash-next-game');
        if (dashNext) dashNext.textContent = `Quarta, ${d}/${m} - 21:00`;
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
            .sort((a,b) => new Date(b.date) - new Date(a.date))
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

        // Considerar todo o semestre ou todas transações (já que o app está iniciando)
        // O usuário pediu "resumo financeiro do semestre".
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        this.data.transactions.forEach(t => {
            const tDate = new Date(t.date);
            if (tDate >= sixMonthsAgo) {
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
        const mensalistas = sorted.filter(p => p.type === 'mensalista');
        
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
                    <div style="font-weight: 600; font-size: 16px; line-height: 1.2;">${p.nickname || p.name}</div>
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

    getAttendanceStatus(date, playerId) {
        if (!this.data.attendance[date]) return 'doubt';
        return this.data.attendance[date][playerId] || 'doubt';
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

        let text = `⚽ *RESENHA F.C - Lista de Presença*\n\n📅 Data: ${dateText}\n\n`;
        
        const [year, month, dayStr] = dateValue.split('-');
        const dayNum = parseInt(dayStr, 10);
        const dateObj = new Date(year, parseInt(month) - 1, dayNum);
        
        // Verifica se é a primeira quarta-feira do mês (dia 3 e nos primeiros 7 dias do mês)
        if (dateObj.getDay() === 3 && dayNum <= 7) {
            text += `⚠️🚨 *Semana de pagamento do mensal* 🚨⚠️\n\n`;
        }

        text += `*Avulsos deverão pagar antes da partida para o pix:*\n\n`;
        text += `*13997741390*\n`;
        text += `LEANDRO MORAES DA SILVA\n\n\n`;

        const mensalistas = this.data.players.filter(p => p.type === 'mensalista');
        const totalM = mensalistas.length;
        const totalPresentLines = Math.max(totalM, present.length);
        const totalAbsentLines = Math.max(Math.ceil(totalM / 2), absent.length);

        text += `✅ *Presentes (${present.length})*\n`;
        for (let i = 0; i < totalPresentLines; i++) {
            if (i < present.length) {
                text += `${i + 1}. ${present[i]}\n`;
            } else {
                text += `${i + 1}.\n`;
            }
        }

        text += `\n📋 *Lista de espera (avulsos)*\n`;
        for (let i = 1; i <= 5; i++) {
            text += `${i}.\n`;
        }

        text += `\n❌ *Ausentes (${absent.length})*\n`;
        for (let i = 0; i < totalAbsentLines; i++) {
            if (i < absent.length) {
                text += `${i + 1}. ${absent[i]}\n`;
            } else {
                text += `${i + 1}.\n`;
            }
        }

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
        
        const sortedTransactions = [...this.data.transactions].sort((a,b) => new Date(b.date) - new Date(a.date));

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
        
        const playerData = {
            id: this.editingPlayerId || Date.now(),
            fullName: document.getElementById('player-fullname').value,
            nickname: document.getElementById('player-nickname').value,
            phone: document.getElementById('player-phone').value,
            position: document.getElementById('player-position').value,
            type: type,
            status: document.getElementById('player-status').value,
            isTemporary: isGuest,
            validDate: isGuest ? document.getElementById('guest-match-date').value : null
        };

        if (this.editingPlayerId) {
            const index = this.data.players.findIndex(p => p.id == this.editingPlayerId);
            this.data.players[index] = playerData;
        } else {
            this.data.players.push(playerData);
            if (isGuest && playerData.validDate) {
                this.setAttendance(playerData.validDate, playerData.id, 'present');
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

    registerPayment(id) {
        const player = this.data.players.find(p => p.id == id);
        if(!player) return;
        
        const amount = player.type === 'avulso' ? this.data.config.avulsoValue : this.data.config.mensalValue;
        const descStr = player.type === 'avulso' ? 'Avulso' : 'Mensalidade';

        player.status = 'paid';
        const displayName = player.nickname && player.fullName && player.nickname !== player.fullName 
            ? `${player.nickname} (${player.fullName})` 
            : (player.nickname || player.fullName);
        
        // Adiciona ao financeiro
        this.data.transactions.push({
            id: Date.now(),
            date: new Date().toISOString().split('T')[0],
            description: `Pagamento ${descStr} - ${displayName}`,
            type: 'in',
            amount: amount,
            playerId: id // vinculo para poder desfazer
        });

        this.saveData();
        this.renderPlayers();
        this.renderAttendance();
        this.updateDashboard();
        this.renderFinance();
    }

    undoPayment(id) {
        const player = this.data.players.find(p => p.id == id);
        if(!player) return;
        
        player.status = 'unpaid';
        
        // Remove a transação do financeiro associada a esse pagamento (a mais recente atrelada a ele)
        const txs = this.data.transactions;
        for (let i = txs.length - 1; i >= 0; i--) {
            if (txs[i].playerId == id && txs[i].type === 'in') {
                txs.splice(i, 1);
                break;
            }
        }

        this.saveData();
        this.renderPlayers();
        this.renderAttendance();
        this.updateDashboard();
        this.renderFinance();
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
            document.getElementById('sorteio-count').innerHTML = `<span style="color: var(--neon-green)">${selectedCount}</span>/${confirmed.length}`;
        }

        pool.innerHTML = confirmed.map(p => {
            const pid = String(p.id);
            const isGoleiro = (p.position || '').toLowerCase().trim() === 'goleiro';
            const isSelected = this.drawSelections.has(pid);
            return `
                <div class="glass-card draw-player-card ${isSelected ? 'selected' : ''}" 
                     onclick="app.toggleDrawSelection('${pid}')"
                     style="padding: 10px; font-size: 13px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; transition: all 0.2s; border: 1px solid ${isSelected ? 'var(--neon-green)' : 'rgba(255,255,255,0.05)'}; background: ${isSelected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)'};">
                    <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                        <i class="ph ${isGoleiro ? 'ph-hand-fist' : 'ph-user'}" style="color: ${isGoleiro ? 'var(--neon-blue)' : (isSelected ? 'var(--neon-green)' : 'var(--text-muted)')}"></i>
                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; ${isSelected ? 'font-weight: 700; color: #fff;' : ''}">${p.nickname || p.name}</span>
                    </div>
                    ${isSelected ? '<i class="ph ph-check-circle" style="color: var(--neon-green); font-size: 18px;"></i>' : '<i class="ph ph-circle" style="color: rgba(255,255,255,0.1); font-size: 18px;"></i>'}
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

        // 3. Renderizar
        rankingContainer.innerHTML = ranking.length ? ranking.map((item, index) => {
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

    getSelectedMatchDateText() {
        const dateInput = document.getElementById('match-date-select');
        if (!dateInput || !dateInput.value) return '';
        
        const [year, month, day] = dateInput.value.split('-');
        const dateObj = new Date(year, parseInt(month) - 1, day);
        
        const label = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
        return label.charAt(0).toUpperCase() + label.slice(1) + " - 21:00";
    }
}

const app = new FootballApp();
// Expose functions globally for inline HTML onclick handlers
window.app = app;
