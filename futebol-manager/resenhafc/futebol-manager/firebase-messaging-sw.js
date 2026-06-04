importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyBDrruu7PfK1xWJ8x77KaZSO-A1HxlRo1s",
    authDomain: "resenha-fc-3543b.firebaseapp.com",
    projectId: "resenha-fc-3543b",
    storageBucket: "resenha-fc-3543b.firebasestorage.app",
    messagingSenderId: "825293531934",
    appId: "1:825293531934:web:7f52316cabb168f4a5b70f"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// O Firebase lida automaticamente com mensagens que possuem a chave 'notification'
// Não precisamos do onBackgroundMessage para notificações padrão.

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    // Open the app when notification is clicked
    event.waitUntil(
        clients.openWindow('https://gestaoresenhafc.vercel.app/')
    );
});
