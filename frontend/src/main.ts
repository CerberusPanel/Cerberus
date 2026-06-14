import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { useTheme } from './composables/useTheme'

import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

import App from './App.vue'
import router from './router'
import './assets/style.css'
import { useAuthStore } from './stores/auth'
import { useAppStore } from './stores/app'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(ElementPlus)
app.component('FontAwesomeIcon', FontAwesomeIcon)
useAppStore(pinia).startHeartbeat()
void useAuthStore(pinia).bootstrap()
useTheme()
app.mount('#app')
