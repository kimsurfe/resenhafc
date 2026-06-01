const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (e) {
        console.error("Error initializing Firebase Admin", e);
    }
}

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const db = admin.firestore();
        const messaging = admin.messaging();

        const docRef = db.collection('appData').doc('mainData');
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            return res.status(404).json({ message: 'appData not found' });
        }

        const data = docSnap.data();
        let customPushes = data.customPushes || [];

        if (customPushes.length === 0) {
            return res.status(200).json({ message: 'No custom pushes scheduled.' });
        }

        const now = new Date();
        const pushesToSend = [];
        const remainingPushes = [];

        // Check which pushes should be sent
        customPushes.forEach(push => {
            const scheduledFor = new Date(push.scheduledFor);
            // Include a 5 minute tolerance
            if (scheduledFor <= now) {
                pushesToSend.push(push);
            } else {
                remainingPushes.push(push);
            }
        });

        if (pushesToSend.length === 0) {
            return res.status(200).json({ message: 'No custom pushes to send at this time.' });
        }

        const players = data.players || [];
        // Calculate matchDateStr for attendance check
        const config = data.config || {};
        const matchDay = config.matchDay !== undefined ? parseInt(config.matchDay, 10) : 3;
        const rotationDay = config.rotationDay !== undefined ? parseInt(config.rotationDay, 10) : 4;
        const matchTime = config.matchTime || "21:00";
        
        let daysUntilMatch = (matchDay - now.getDay() + 7) % 7;
        if (matchDay === rotationDay && now.getDay() === matchDay) {
            const [matchHour] = matchTime.split(':').map(Number);
            if (now.getHours() >= (matchHour || 21)) daysUntilMatch = 7;
        }

        let matchDate = new Date(now);
        matchDate.setDate(now.getDate() + daysUntilMatch);
        const y = matchDate.getFullYear();
        const m = String(matchDate.getMonth() + 1).padStart(2, '0');
        const d = String(matchDate.getDate()).padStart(2, '0');
        const matchDateStr = `${y}-${m}-${d}`;
        const attendance = (data.attendance && data.attendance[matchDateStr]) ? data.attendance[matchDateStr] : {};

        let totalSent = 0;

        for (const push of pushesToSend) {
            let tokens = [];
            if (push.target === 'all') {
                tokens = players.filter(p => p.pushToken).map(p => p.pushToken);
            } else if (push.target === 'pending') {
                tokens = players.filter(p => p.pushToken && attendance[p.id] === undefined).map(p => p.pushToken);
            }

            if (tokens.length > 0) {
                const promises = tokens.map(token => {
                    const message = {
                        notification: { title: push.title, body: push.body },
                        token: token,
                        webpush: { fcmOptions: { link: 'https://gestaoresenhafc.vercel.app/' } }
                    };
                    return messaging.send(message)
                        .then(() => ({ success: true }))
                        .catch(err => ({ success: false, error: err }));
                });

                try {
                    const responses = await Promise.all(promises);
                    const successCount = responses.filter(r => r.success).length;
                    const failureCount = responses.length - successCount;
                    totalSent += successCount;
                    
                    if (failureCount > 0) {
                        const failedReasons = [];
                        responses.forEach(resp => {
                            if (!resp.success && resp.error) {
                                failedReasons.push(resp.error.message);
                            }
                        });
                        
                        await docRef.update({
                            customPushes: remainingPushes
                        });
                        
                        return res.status(200).json({ 
                            success: true, 
                            message: `Disparo feito! Entregues: ${successCount}. Falhas: ${failedReasons.join(', ')}`,
                            remaining: remainingPushes.length
                        });
                    }
                } catch (e) {
                    console.error("Error sending custom push", e);
                    return res.status(500).json({ error: e.message });
                }
            }
        }

        // Save remaining pushes back to DB
        await docRef.update({
            customPushes: remainingPushes
        });

        return res.status(200).json({ 
            success: true, 
            message: `Processed ${pushesToSend.length} schedules. Sent to ${totalSent} devices.`,
            remaining: remainingPushes.length
        });

    } catch (error) {
        console.error("Error checking custom push:", error);
        return res.status(500).json({ error: error.message });
    }
}
