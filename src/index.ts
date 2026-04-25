import dotenv from 'dotenv';
dotenv.config();

import { start } from './whatsapp/client';

console.log('🚀 Iniciando RT Assistant...');
start();
