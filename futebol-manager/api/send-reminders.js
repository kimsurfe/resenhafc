const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (e) {
        console.error("Error initializing Firebase Admin. Check FIREBASE_SERVICE_ACCOUNT env var.", e);
    }
}

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    // Cron jobs authentication (Vercel sets an authorization header if configured)
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        const db = admin.firestore();
        const messaging = admin.messaging();

        // Fetch App Data
        const docRef = db.collection('appData').doc('mainData');
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            return res.status(404).json({ message: 'appData not found' });
        }

        const data = docSnap.data();
        const players = data.players || [];
        const config = data.config || {};
        const matchDay = config.matchDay !== undefined ? parseInt(config.matchDay, 10) : 3;
        const rotationDay = config.rotationDay !== undefined ? parseInt(config.rotationDay, 10) : 4;
        const matchTime = config.matchTime || "21:00";
        const notifications = data.notifications || {};
        
        const today = new Date();
        const dayOfWeek = today.getDay();

        let daysUntilMatch = (matchDay - dayOfWeek + 7) % 7;
        
        if (matchDay === rotationDay && dayOfWeek === matchDay) {
            const [matchHour, matchMin] = matchTime.split(':').map(Number);
            if (today.getHours() >= (matchHour || 21)) {
                daysUntilMatch = 7;
            }
        }

        let matchDate = new Date(today);
        matchDate.setDate(today.getDate() + daysUntilMatch);
        
        const y = matchDate.getFullYear();
        const m = String(matchDate.getMonth() + 1).padStart(2, '0');
        const d = String(matchDate.getDate()).padStart(2, '0');
        const matchDateStr = `${y}-${m}-${d}`;
        
        const attendance = (data.attendance && data.attendance[matchDateStr]) ? data.attendance[matchDateStr] : {};

        matchDate.setHours(0,0,0,0);
        today.setHours(0,0,0,0);
        
        const diffTime = matchDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

        let tokensToNotify = [];
        let title = '';
        let body = '';

        if (diffDays === 3 && notifications.notifyDay3) {
            // Notify ALL players
            title = 'A Lista da Rodada abriu! ⚽';
            body = 'Garanta sua vaga para o próximo jogo! Acesse o app agora e confirme sua presença.';
            
            tokensToNotify = players
                .filter(p => p.pushToken)
                .map(p => p.pushToken);
        } 
        else if (diffDays === 2 && notifications.notifyDay2) {
            // Notify ONLY pending
            title = 'Faltam 2 dias para o jogo! ⏳';
            body = 'Ainda não confirmou sua presença? Responda na lista para ajudar na divisão dos times!';
            
            tokensToNotify = players
                .filter(p => p.pushToken && attendance[p.id] === undefined)
                .map(p => p.pushToken);
        }
        else if (diffDays === 1 && notifications.notifyDay1) {
            // Notify ONLY pending
            title = 'O jogo é amanhã! Vai ou não? 🤔';
            body = 'Você ainda não respondeu a lista. Confirme sua presença ou avise que não vai!';
            
            tokensToNotify = players
                .filter(p => p.pushToken && attendance[p.id] === undefined)
                .map(p => p.pushToken);
        } else {
            return res.status(200).json({ message: `No notifications scheduled for ${diffDays} days before match.` });
        }

        if (tokensToNotify.length === 0) {
            return res.status(200).json({ message: 'No tokens to notify.' });
        }

        // Send messages individually
        const promises = tokensToNotify.map(token => {
            const message = {
                notification: { title, body },
                token: token,
                webpush: {
                    fcmOptions: {
                        link: 'https://gestaoresenhafc.vercel.app/'
                    }
                }
            };
            return messaging.send(message)
                .then(() => ({ success: true }))
                .catch(err => ({ success: false, error: err }));
        });

        const responses = await Promise.all(promises);
        const successCount = responses.filter(r => r.success).length;
        const failureCount = responses.length - successCount;
        
        return res.status(200).json({ 
            success: true, 
            message: `Sent ${successCount} messages. Failed: ${failureCount}` 
        });

    } catch (error) {
        console.error("Error sending push:", error);
        return res.status(500).json({ error: error.message });
    }
}
