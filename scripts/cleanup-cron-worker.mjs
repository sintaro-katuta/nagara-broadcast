import {cleanupExpiredAuth} from '../cloudflare/auth-cleanup.mjs';
export default {async scheduled(controller,env){const result=await cleanupExpiredAuth(env.DB,controller.scheduledTime);console.log('Synthetic cleanup counts',JSON.stringify(result));}};
