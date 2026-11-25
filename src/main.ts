import { createApp } from 'vue'
import { applyRequestedStorageReset } from './lib/reset-storage'
import './assets/style.css'
import './assets/workbench.css'
import './assets/unified-workbench.css'
import './assets/fluent-theme.css'
import './assets/fluent-controls.css'
import './assets/fluent-player.css'
import '@fluentui/web-components/button.js'
import '@fluentui/web-components/checkbox.js'
import '@fluentui/web-components/progress-bar.js'

async function bootstrap(){
 try{await applyRequestedStorageReset()}catch(error){console.warn('本地存储清理请求无法读取',error)}
 const {default:App}=await import('./App.vue')
 createApp(App).mount('#app')
}
void bootstrap()
