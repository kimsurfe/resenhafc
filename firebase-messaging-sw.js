importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyBDrruu7PFK1xWJ8x77KaZSO-A1HxlRo1s",
    authDomain: "resenha-fc-3543b.firebaseapp.com",
    projectId: "resenha-fc-3543b",
    storageBucket: "resenha-fc-3543b.firebasestorage.app",
    messagingSenderId: "825293531934",
    appId: "1:825293531934:web:7f52316cabb168f4a5b70f"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/resenha_logotipo.jpg',
        badge: '/resenha_logotipo.jpg',
        data: payload.data
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    // Open the app when notification is clicked
    event.waitUntil(
        clients.openWindow('https://gestaoresenhafc.vercel.app/')
    );
});
