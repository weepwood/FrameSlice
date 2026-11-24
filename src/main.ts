import { createApp } from 'vue'
import { applyRequestedStorageReset } from './lib/reset-storage'
import './assets/style.css'
import './assets/workbench.css'

async function bootstrap(){
 try{await applyRequestedStorageReset()}catch(error){console.warn('本地存储清理请求无法读取',error)}
 const {default:App}=await import('./App.vue')
 createApp(App).mount('#app')
}
void bootstrap()
