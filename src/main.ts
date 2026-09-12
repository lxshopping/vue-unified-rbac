import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { initKeycloak } from './auth/keycloak'
import { permissionDirective } from './directives/permission'
import './style.css'

// const app = createApp(App)

// app.use(createPinia())
// app.use(router)
// app.directive('permission', permissionDirective)
// app.mount('#app')


async function bootstrap() {
  try {
    await initKeycloak()

    const app = createApp(App)

    app.use(createPinia())
    app.use(router)
    app.directive('permission', permissionDirective)

    app.mount('#app')
  } catch (error) {
    console.error('Keycloak 初始化失败', error)
  }
}

bootstrap()