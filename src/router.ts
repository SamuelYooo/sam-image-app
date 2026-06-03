import { createRouter, createWebHistory } from 'vue-router'
import HomePage from './pages/HomePage.vue'
import WorkspacePage from './pages/WorkspacePage.vue'
import ToolsPage from './pages/ToolsPage.vue'
import HistoryPage from './pages/HistoryPage.vue'
import OperationHistoryPage from './pages/OperationHistoryPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import AboutPage from './pages/AboutPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/workspace', name: 'workspace', component: WorkspacePage },
    { path: '/tools', name: 'tools', component: ToolsPage },
    { path: '/history', name: 'history', component: HistoryPage },
    { path: '/operations', name: 'operations', component: OperationHistoryPage },
    { path: '/settings', name: 'settings', component: SettingsPage },
    { path: '/about', name: 'about', component: AboutPage },
  ],
})

export default router
