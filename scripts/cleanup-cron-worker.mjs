import {cleanupExpiredAuth,cleanupOldPositionCursors} from '../cloudflare/auth-cleanup.mjs';
export default {async scheduled(controller,env){const result=await cleanupExpiredAuth(env.DB,controller.scheduledTime),cursors=await cleanupOldPositionCursors(env.DB,controller.scheduledTime);console.log('Synthetic cleanup counts',JSON.stringify(result),cursors);}};
