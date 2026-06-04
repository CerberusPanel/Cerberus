import { ref } from 'vue'

type Theme = 'light' | 'dark' | 'system'

const theme = ref<Theme>(
  (localStorage.getItem('theme') as Theme) || 'system'
)
let listenerAttached = false

function applyTheme() {
  const root = document.documentElement
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches

  root.classList.remove('dark')

  if (theme.value === 'dark' || (theme.value === 'system' && systemDark)) {
    root.classList.add('dark')
  }
}

export function useTheme() {
  function setTheme(value: Theme) {
    theme.value = value
    localStorage.setItem('theme', value)
    applyTheme()
  }

  applyTheme()

  if (!listenerAttached) {
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', applyTheme)
    listenerAttached = true
  }

  return {
    theme,
    setTheme,
  }
}
