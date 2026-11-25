import { createApp } from 'vue'
import { applyRequestedStorageReset } from './lib/reset-storage'
import './assets/style.css'
import './assets/workbench.css'
import './assets/unified-workbench.css'
import './assets/fluent-theme.css'
import './assets/fluent-controls.css'
import './assets/fluent-player.css'
import '@fluentui/web-components/button.js'
import 'media-chrome'
import 'media-chrome/lang/zh-CN'
import {setLanguage} from 'media-chrome/utils/i18n'
setLanguage('zh-CN')

async function bootstrap(){
 try{await applyRequestedStorageReset()}catch(error){console.warn('本地存储清理请求无法读取',error)}
 const {default:App}=await import('./App.vue')
 createApp(App).mount('#app')
}
void bootstrap()
