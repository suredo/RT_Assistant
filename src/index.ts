import dotenv from 'dotenv';
dotenv.config();

import { start } from './whatsapp/client';

// whatsapp-web.js can throw detached-frame / protocol errors internally during
// disconnect/logout events. Catching them here prevents a process crash —
// the disconnected handler's setTimeout(createClient) still runs normally.
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Rejeição não tratada (recuperável):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ Exceção não capturada (recuperável):', err);
});

console.log('🚀 Iniciando RT Assistant...');
start();
