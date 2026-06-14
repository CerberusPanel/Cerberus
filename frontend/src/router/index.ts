import { createRouter, createWebHashHistory } from 'vue-router'

import AuthLayout from '../layouts/AuthLayout.vue'
import MainLayout from '../layouts/MainLayout.vue'
import Login from '../pages/Login.vue'
import Dashboard from '../pages/Dashboard.vue'
import Containers from '../pages/Containers.vue'
import Apps from '../pages/Apps.vue'
import AppBrowser from '../pages/AppBrowser.vue'
import AppStoreSettings from '../pages/AppStoreSettings.vue'
import Settings from '../pages/Settings.vue'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/login',
      component: AuthLayout,
      children: [{ path: '', component: Login }],
    },
    {
      path: '/',
      component: MainLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/dashboard' },
        { path: 'dashboard', component: Dashboard },
        { path: 'containers', component: Containers },
        { path: 'apps', component: Apps },
        { path: 'apps/browser', component: AppBrowser },
        { path: 'apps/settings', component: AppStoreSettings },
        { path: 'settings', component: Settings },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/dashboard',
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  const needsAuth = to.matched.some((record) => Boolean(record.meta.requiresAuth))
  const isLoginRoute = to.path === '/login'
  const redirectTarget = typeof to.query.redirect === 'string' && to.query.redirect.length > 0 ? to.query.redirect : '/dashboard'

  await auth.bootstrap()

  if (needsAuth) {
    const sessionValid = await auth.ensureSession()
    if (!sessionValid) {
      return {
        path: '/login',
        query: {
          redirect: to.fullPath,
        },
      }
    }
  }

  if (isLoginRoute && auth.isAuthenticated) {
    return { path: redirectTarget }
  }

  return true
})

export default router
