<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-800 dark:text-white/90">Containers</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400">System overview</p>
    </div>

    <div class="rounded-2xl border border-gray-200 bg-white p-4 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <div class="flex items-start justify-between">
        <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90">Runtime inventory</h3>
        <a
          href="#"
          class="flex justify-center gap-2 rounded-lg border border-gray-300 bg-white p-2.5 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03]"
        >
          Refresh
        </a>
      </div>

      <div class="my-6 overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800">
        <table class="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
          <thead class="bg-gray-50 dark:bg-white/[0.03]">
            <tr>
              <th class="px-4 py-3 text-left text-theme-xs font-medium text-gray-400">Name</th>
              <th class="px-4 py-3 text-left text-theme-xs font-medium text-gray-400">Image</th>
              <th class="px-4 py-3 text-left text-theme-xs font-medium text-gray-400">Status</th>
              <th class="px-4 py-3 text-left text-theme-xs font-medium text-gray-400">Ports</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-transparent">
            <tr>
              <td class="px-4 py-4 text-theme-sm text-gray-500 dark:text-gray-400" colspan="4">
                Connect Docker to show your container inventory.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
