import type { ProjectGraphResult } from '../../types'

export const vueconfWorkshop2026: ProjectGraphResult = {
  "workspaceName": "vueconf-workshop-2026",
  "nodes": [
    {
      "id": "__nuxt-router__",
      "label": "Nuxt Router",
      "path": "__nuxt-router__",
      "kind": "ts",
      "color": "router",
      "virtual": true,
      "importCount": 12,
      "importedByCount": 1
    },
    {
      "id": "app/app.vue",
      "label": "app.vue",
      "path": "app/app.vue",
      "kind": "vue",
      "color": "vue",
      "importCount": 2,
      "importedByCount": 0
    },
    {
      "id": "app/components/AppSidebar.vue",
      "label": "AppSidebar.vue",
      "path": "app/components/AppSidebar.vue",
      "kind": "vue",
      "color": "component",
      "importCount": 1,
      "importedByCount": 1
    },
    {
      "id": "app/components/LightDarkToggle.vue",
      "label": "LightDarkToggle.vue",
      "path": "app/components/LightDarkToggle.vue",
      "kind": "vue",
      "color": "component",
      "importCount": 0,
      "importedByCount": 1
    },
    {
      "id": "app/composables/useDarkMode.ts",
      "label": "useDarkMode.ts",
      "path": "app/composables/useDarkMode.ts",
      "kind": "ts",
      "color": "ts",
      "importCount": 0,
      "importedByCount": 0
    },
    {
      "id": "app/layouts/default.vue",
      "label": "default.vue",
      "path": "app/layouts/default.vue",
      "kind": "vue",
      "color": "vue",
      "importCount": 1,
      "importedByCount": 1
    },
    {
      "id": "app/pages/daily-report-tags/index.vue",
      "label": "index.vue",
      "path": "app/pages/daily-report-tags/index.vue",
      "kind": "vue",
      "color": "view",
      "importCount": 0,
      "importedByCount": 1
    },
    {
      "id": "app/pages/emails/index.vue",
      "label": "index.vue",
      "path": "app/pages/emails/index.vue",
      "kind": "vue",
      "color": "view",
      "importCount": 0,
      "importedByCount": 1
    },
    {
      "id": "app/pages/index.vue",
      "label": "index.vue",
      "path": "app/pages/index.vue",
      "kind": "vue",
      "color": "view",
      "importCount": 0,
      "importedByCount": 1
    },
    {
      "id": "app/pages/materials/index.vue",
      "label": "index.vue",
      "path": "app/pages/materials/index.vue",
      "kind": "vue",
      "color": "view",
      "importCount": 0,
      "importedByCount": 1
    },
    {
      "id": "app/pages/parents/index.vue",
      "label": "index.vue",
      "path": "app/pages/parents/index.vue",
      "kind": "vue",
      "color": "view",
      "importCount": 0,
      "importedByCount": 1
    },
    {
      "id": "app/pages/projects/[id]/daily-reports/[reportId].vue",
      "label": "[reportId].vue",
      "path": "app/pages/projects/[id]/daily-reports/[reportId].vue",
      "kind": "vue",
      "color": "view",
      "importCount": 0,
      "importedByCount": 1
    },
    {
      "id": "app/pages/projects/[id]/index.vue",
      "label": "index.vue",
      "path": "app/pages/projects/[id]/index.vue",
      "kind": "vue",
      "color": "view",
      "importCount": 0,
      "importedByCount": 1
    },
    {
      "id": "app/pages/projects/index.vue",
      "label": "index.vue",
      "path": "app/pages/projects/index.vue",
      "kind": "vue",
      "color": "view",
      "importCount": 0,
      "importedByCount": 1
    },
    {
      "id": "app/pages/students/index.vue",
      "label": "index.vue",
      "path": "app/pages/students/index.vue",
      "kind": "vue",
      "color": "view",
      "importCount": 0,
      "importedByCount": 1
    },
    {
      "id": "app/pages/test.vue",
      "label": "test.vue",
      "path": "app/pages/test.vue",
      "kind": "vue",
      "color": "view",
      "importCount": 0,
      "importedByCount": 1
    },
    {
      "id": "app/pages/trips/[id]/index.vue",
      "label": "index.vue",
      "path": "app/pages/trips/[id]/index.vue",
      "kind": "vue",
      "color": "view",
      "importCount": 0,
      "importedByCount": 1
    },
    {
      "id": "app/pages/trips/index.vue",
      "label": "index.vue",
      "path": "app/pages/trips/index.vue",
      "kind": "vue",
      "color": "view",
      "importCount": 0,
      "importedByCount": 1
    }
  ],
  "edges": [
    {
      "id": "__nuxt-router__->app/pages/daily-report-tags/index.vue:import",
      "source": "__nuxt-router__",
      "target": "app/pages/daily-report-tags/index.vue",
      "kind": "import",
      "specifier": "app/pages/daily-report-tags/index.vue"
    },
    {
      "id": "__nuxt-router__->app/pages/emails/index.vue:import",
      "source": "__nuxt-router__",
      "target": "app/pages/emails/index.vue",
      "kind": "import",
      "specifier": "app/pages/emails/index.vue"
    },
    {
      "id": "__nuxt-router__->app/pages/index.vue:import",
      "source": "__nuxt-router__",
      "target": "app/pages/index.vue",
      "kind": "import",
      "specifier": "app/pages/index.vue"
    },
    {
      "id": "__nuxt-router__->app/pages/materials/index.vue:import",
      "source": "__nuxt-router__",
      "target": "app/pages/materials/index.vue",
      "kind": "import",
      "specifier": "app/pages/materials/index.vue"
    },
    {
      "id": "__nuxt-router__->app/pages/parents/index.vue:import",
      "source": "__nuxt-router__",
      "target": "app/pages/parents/index.vue",
      "kind": "import",
      "specifier": "app/pages/parents/index.vue"
    },
    {
      "id": "__nuxt-router__->app/pages/projects/[id]/daily-reports/[reportId].vue:import",
      "source": "__nuxt-router__",
      "target": "app/pages/projects/[id]/daily-reports/[reportId].vue",
      "kind": "import",
      "specifier": "app/pages/projects/[id]/daily-reports/[reportId].vue"
    },
    {
      "id": "__nuxt-router__->app/pages/projects/[id]/index.vue:import",
      "source": "__nuxt-router__",
      "target": "app/pages/projects/[id]/index.vue",
      "kind": "import",
      "specifier": "app/pages/projects/[id]/index.vue"
    },
    {
      "id": "__nuxt-router__->app/pages/projects/index.vue:import",
      "source": "__nuxt-router__",
      "target": "app/pages/projects/index.vue",
      "kind": "import",
      "specifier": "app/pages/projects/index.vue"
    },
    {
      "id": "__nuxt-router__->app/pages/students/index.vue:import",
      "source": "__nuxt-router__",
      "target": "app/pages/students/index.vue",
      "kind": "import",
      "specifier": "app/pages/students/index.vue"
    },
    {
      "id": "__nuxt-router__->app/pages/test.vue:import",
      "source": "__nuxt-router__",
      "target": "app/pages/test.vue",
      "kind": "import",
      "specifier": "app/pages/test.vue"
    },
    {
      "id": "__nuxt-router__->app/pages/trips/[id]/index.vue:import",
      "source": "__nuxt-router__",
      "target": "app/pages/trips/[id]/index.vue",
      "kind": "import",
      "specifier": "app/pages/trips/[id]/index.vue"
    },
    {
      "id": "__nuxt-router__->app/pages/trips/index.vue:import",
      "source": "__nuxt-router__",
      "target": "app/pages/trips/index.vue",
      "kind": "import",
      "specifier": "app/pages/trips/index.vue"
    },
    {
      "id": "app/app.vue->__nuxt-router__:import:NuxtPage",
      "source": "app/app.vue",
      "target": "__nuxt-router__",
      "kind": "import",
      "specifier": "NuxtPage"
    },
    {
      "id": "app/app.vue->app/layouts/default.vue:import:NuxtLayout",
      "source": "app/app.vue",
      "target": "app/layouts/default.vue",
      "kind": "import",
      "specifier": "NuxtLayout"
    },
    {
      "id": "app/components/AppSidebar.vue->app/components/LightDarkToggle.vue:import:LightDarkToggle",
      "source": "app/components/AppSidebar.vue",
      "target": "app/components/LightDarkToggle.vue",
      "kind": "import",
      "specifier": "LightDarkToggle"
    },
    {
      "id": "app/layouts/default.vue->app/components/AppSidebar.vue:import:AppSidebar",
      "source": "app/layouts/default.vue",
      "target": "app/components/AppSidebar.vue",
      "kind": "import",
      "specifier": "AppSidebar"
    }
  ],
  "stats": {
    "fileCount": 18,
    "vueFileCount": 16,
    "tsFileCount": 2,
    "storeFileCount": 0,
    "serviceFileCount": 0,
    "viewFileCount": 12,
    "componentFileCount": 2,
    "routerFileCount": 1,
    "edgeCount": 16
  }
}
