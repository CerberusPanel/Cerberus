<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Users } from 'lucide-vue-next'
import { createUser, fetchUsers, type UserRecord } from '../services/api'

const users = ref<UserRecord[]>([])
const loadingUsers = ref(true)
const savingUser = ref(false)

const newUser = reactive({
  username: '',
  displayName: '',
  password: '',
})

async function loadUsers() {
  loadingUsers.value = true
  try {
    users.value = await fetchUsers()
  } catch (error) {
    users.value = []
    ElMessage.error('Only the master account can view users.')
  } finally {
    loadingUsers.value = false
  }
}

async function submitUser() {
  if (!newUser.username || !newUser.password || savingUser.value) {
    return
  }

  savingUser.value = true
  try {
    await createUser({
      username: newUser.username,
      displayName: newUser.displayName || newUser.username,
      password: newUser.password,
    })

    ElMessage.success('User created')
    newUser.username = ''
    newUser.displayName = ''
    newUser.password = ''
    await loadUsers()
  } catch (error) {
    ElMessage.error('Unable to create user')
  } finally {
    savingUser.value = false
  }
}

onMounted(async () => {
  await loadUsers()
})
</script>

<template>
  <div class="space-y-6">
    <section class="rounded-2xl border border-gray-200 bg-white p-4 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <div class="flex items-center gap-2">
        <Users class="h-5 w-5 text-brand-500" />
        <div>
          <h1 class="text-2xl font-bold text-gray-800 dark:text-white/90">Settings</h1>
          <p class="text-sm text-gray-500 dark:text-gray-400">Manage users and account access.</p>
        </div>
      </div>
    </section>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div class="rounded-2xl border border-gray-200 bg-white p-4 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 class="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90">Create user</h3>

        <div class="space-y-4">
          <label class="block">
            <span class="mb-1.5 block text-theme-sm text-gray-500 dark:text-gray-400">Username</span>
            <input
              v-model="newUser.username"
              type="text"
              placeholder="jane"
              class="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-none dark:border-gray-800 dark:text-white/90 dark:placeholder:text-white/30"
            />
          </label>

          <label class="block">
            <span class="mb-1.5 block text-theme-sm text-gray-500 dark:text-gray-400">Display name</span>
            <input
              v-model="newUser.displayName"
              type="text"
              placeholder="Jane Doe"
              class="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-none dark:border-gray-800 dark:text-white/90 dark:placeholder:text-white/30"
            />
          </label>

          <label class="block">
            <span class="mb-1.5 block text-theme-sm text-gray-500 dark:text-gray-400">Password</span>
            <input
              v-model="newUser.password"
              type="password"
              placeholder="••••••••"
              class="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-none dark:border-gray-800 dark:text-white/90 dark:placeholder:text-white/30"
            />
          </label>

          <button
            class="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-theme-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-400/70"
            type="button"
            :disabled="savingUser || !newUser.username || !newUser.password"
            @click="submitUser"
          >
            <Plus class="h-4 w-4" />
            {{ savingUser ? 'Creating…' : 'Add user' }}
          </button>
        </div>
      </div>

      <div class="rounded-2xl border border-gray-200 bg-white p-4 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 class="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90">Users</h3>

        <div v-if="loadingUsers" class="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-theme-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
          Loading users…
        </div>

        <div v-else class="overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800">
          <table class="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead class="bg-gray-50 dark:bg-white/[0.03]">
              <tr>
                <th class="px-4 py-3 text-left text-theme-xs font-medium text-gray-400">Username</th>
                <th class="px-4 py-3 text-left text-theme-xs font-medium text-gray-400">Display name</th>
                <th class="px-4 py-3 text-left text-theme-xs font-medium text-gray-400">Role</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-transparent">
              <tr v-if="!users.length">
                <td class="px-4 py-6 text-theme-sm text-gray-500 dark:text-gray-400" colspan="3">
                  No users found.
                </td>
              </tr>
              <tr v-for="user in users" :key="user.username" class="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                <td class="px-4 py-4 font-medium text-gray-800 dark:text-white/90">{{ user.username }}</td>
                <td class="px-4 py-4 text-theme-sm text-gray-500 dark:text-gray-400">{{ user.displayName }}</td>
                <td class="px-4 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                  <span
                    class="inline-flex rounded-full px-2.5 py-1 text-theme-xs font-medium"
                    :class="user.role === 'master' ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'"
                  >
                    {{ user.role }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
