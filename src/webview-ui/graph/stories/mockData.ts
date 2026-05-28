import type {
  ProjectGraphResult,
  ProjectGraphNode,
  ProjectGraphEdge,
  ProjectGraphStats,
} from '../types'

function node(
  id: string,
  color: ProjectGraphNode['color'],
  importCount: number,
  importedByCount: number,
  virtual?: boolean,
): ProjectGraphNode {
  const parts = id.split('/')
  return {
    id,
    label: parts[parts.length - 1],
    path: id,
    kind: id.endsWith('.vue') ? 'vue' : 'ts',
    color,
    importCount,
    importedByCount,
    virtual,
  }
}

function edge(
  source: string,
  target: string,
  kind: ProjectGraphEdge['kind'] = 'import',
): ProjectGraphEdge {
  const specifier = './' + target.split('/').pop()!
  return { id: `${source}->${target}:${kind}:${specifier}`, source, target, kind, specifier }
}

function stats(nodes: ProjectGraphNode[], edges: ProjectGraphEdge[]): ProjectGraphStats {
  return {
    fileCount: nodes.length,
    vueFileCount: nodes.filter(n => n.kind === 'vue').length,
    tsFileCount: nodes.filter(n => n.kind === 'ts').length,
    storeFileCount: nodes.filter(n => n.color === 'store').length,
    serviceFileCount: nodes.filter(n => n.color === 'service').length,
    viewFileCount: nodes.filter(n => n.color === 'view').length,
    componentFileCount: nodes.filter(n => n.color === 'component').length,
    routerFileCount: nodes.filter(n => n.color === 'router').length,
    edgeCount: edges.length,
  }
}

// ─── Simple (~8 nodes, 2 levels) ─────────────────────────────────────────────

const simpleNodes: ProjectGraphNode[] = [
  node('src/main.ts',                        'ts',        2, 0),
  node('src/App.vue',                        'vue',       2, 1),
  node('src/router/index.ts',                'router',    2, 1),
  node('src/views/HomeView.vue',             'view',      2, 2),
  node('src/views/AboutView.vue',            'view',      0, 2),
  node('src/components/HelloWorld.vue',      'component', 0, 1),
  node('src/stores/counter.ts',              'store',     0, 1),
  node('src/components/BaseButton.vue',      'component', 0, 0),
]

const simpleEdges: ProjectGraphEdge[] = [
  edge('src/main.ts',              'src/App.vue'),
  edge('src/main.ts',              'src/router/index.ts'),
  edge('src/App.vue',              'src/views/HomeView.vue',  'dynamic-import'),
  edge('src/App.vue',              'src/views/AboutView.vue', 'dynamic-import'),
  edge('src/router/index.ts',      'src/views/HomeView.vue'),
  edge('src/router/index.ts',      'src/views/AboutView.vue'),
  edge('src/views/HomeView.vue',   'src/components/HelloWorld.vue'),
  edge('src/views/HomeView.vue',   'src/stores/counter.ts'),
]

export const mockSimpleGraph: ProjectGraphResult = {
  workspaceName: 'simple-app',
  nodes: simpleNodes,
  edges: simpleEdges,
  stats: stats(simpleNodes, simpleEdges),
}

// ─── Medium (~20 nodes, all color types) ────────────────────────────────────

const medNodes: ProjectGraphNode[] = [
  node('src/main.ts',                              'ts',        2, 0),
  node('src/App.vue',                              'vue',       4, 1),
  node('src/router/index.ts',                      'router',    5, 1),
  node('src/views/HomeView.vue',                   'view',      2, 2),
  node('src/views/AboutView.vue',                  'view',      1, 2),
  node('src/views/DashboardView.vue',              'view',      3, 2),
  node('src/views/ProfileView.vue',                'view',      2, 1),
  node('src/components/NavBar.vue',                'component', 2, 1),
  node('src/components/BaseButton.vue',            'component', 0, 4),
  node('src/components/BaseInput.vue',             'component', 0, 3),
  node('src/components/DataTable.vue',             'component', 1, 2),
  node('src/components/UserCard.vue',              'component', 1, 2),
  node('src/stores/auth.ts',                       'store',     1, 3),
  node('src/stores/user.ts',                       'store',     0, 2),
  node('src/stores/settings.ts',                   'store',     0, 1),
  node('src/services/api.ts',                      'service',   0, 4),
  node('src/services/auth.service.ts',             'service',   1, 2),
  node('src/composables/useNotification.ts',       'ts',        0, 3),
  node('src/composables/useFormatDate.ts',         'ts',        0, 2),
  node('src/types/index.ts',                       'ts',        0, 5),
]

const medEdges: ProjectGraphEdge[] = [
  edge('src/main.ts',                         'src/App.vue'),
  edge('src/main.ts',                         'src/router/index.ts'),
  edge('src/App.vue',                         'src/components/NavBar.vue'),
  edge('src/App.vue',                         'src/views/HomeView.vue',      'dynamic-import'),
  edge('src/App.vue',                         'src/views/AboutView.vue',     'dynamic-import'),
  edge('src/App.vue',                         'src/views/DashboardView.vue', 'dynamic-import'),
  edge('src/router/index.ts',                 'src/views/HomeView.vue'),
  edge('src/router/index.ts',                 'src/views/AboutView.vue'),
  edge('src/router/index.ts',                 'src/views/DashboardView.vue'),
  edge('src/router/index.ts',                 'src/views/ProfileView.vue'),
  edge('src/router/index.ts',                 'src/types/index.ts'),
  edge('src/views/HomeView.vue',              'src/components/DataTable.vue'),
  edge('src/views/HomeView.vue',              'src/stores/auth.ts'),
  edge('src/views/AboutView.vue',             'src/types/index.ts'),
  edge('src/views/DashboardView.vue',         'src/components/DataTable.vue'),
  edge('src/views/DashboardView.vue',         'src/stores/user.ts'),
  edge('src/views/DashboardView.vue',         'src/composables/useFormatDate.ts'),
  edge('src/views/ProfileView.vue',           'src/components/UserCard.vue'),
  edge('src/views/ProfileView.vue',           'src/stores/user.ts'),
  edge('src/components/NavBar.vue',           'src/stores/auth.ts'),
  edge('src/components/NavBar.vue',           'src/composables/useNotification.ts'),
  edge('src/components/DataTable.vue',        'src/types/index.ts'),
  edge('src/components/UserCard.vue',         'src/types/index.ts'),
  edge('src/stores/auth.ts',                  'src/services/auth.service.ts'),
  edge('src/services/auth.service.ts',        'src/services/api.ts'),
  edge('src/composables/useNotification.ts',  'src/types/index.ts'),
]

export const mockMediumGraph: ProjectGraphResult = {
  workspaceName: 'medium-app',
  nodes: medNodes,
  edges: medEdges,
  stats: stats(medNodes, medEdges),
}

// ─── Large (~40 nodes, stress-tests layout and zoom) ─────────────────────────

function makeFeatureNodes(feature: string): ProjectGraphNode[] {
  return [
    node(`src/views/${feature}View.vue`,            'view',      3, 1),
    node(`src/components/${feature}/List.vue`,       'component', 1, 1),
    node(`src/components/${feature}/Detail.vue`,     'component', 2, 1),
    node(`src/components/${feature}/Form.vue`,       'component', 2, 1),
    node(`src/stores/${feature.toLowerCase()}.ts`,   'store',     1, 2),
  ]
}

function makeFeatureEdges(feature: string): ProjectGraphEdge[] {
  const f = feature
  const fl = feature.toLowerCase()
  return [
    edge(`src/views/${f}View.vue`,              `src/components/${f}/List.vue`),
    edge(`src/views/${f}View.vue`,              `src/components/${f}/Detail.vue`),
    edge(`src/views/${f}View.vue`,              `src/stores/${fl}.ts`),
    edge(`src/components/${f}/Detail.vue`,      `src/components/shared/BaseCard.vue`),
    edge(`src/components/${f}/Form.vue`,        `src/components/shared/BaseInput.vue`),
    edge(`src/components/${f}/Form.vue`,        `src/components/shared/BaseButton.vue`),
    edge(`src/stores/${fl}.ts`,                 `src/services/api.ts`),
  ]
}

const features = ['Product', 'Order', 'Customer', 'Invoice']

const largeBaseNodes: ProjectGraphNode[] = [
  node('src/main.ts',                             'ts',        2, 0),
  node('src/App.vue',                             'vue',       3, 1),
  node('src/router/index.ts',                     'router',    4, 1),
  node('src/services/api.ts',                     'service',   0, features.length + 1),
  node('src/services/http.ts',                    'service',   0, 1),
  node('src/components/shared/BaseButton.vue',    'component', 0, features.length * 2),
  node('src/components/shared/BaseInput.vue',     'component', 0, features.length * 2),
  node('src/components/shared/BaseCard.vue',      'component', 0, features.length),
  node('src/components/shared/BaseModal.vue',     'component', 0, 2),
  node('src/stores/auth.ts',                      'store',     1, 3),
  node('src/stores/settings.ts',                  'store',     0, 2),
  node('src/composables/useToast.ts',             'ts',        0, features.length),
  node('src/composables/useValidation.ts',        'ts',        0, features.length),
  node('src/types/index.ts',                      'ts',        0, features.length + 2),
]

const largeFeatureNodes = features.flatMap(makeFeatureNodes)

const largeNodes = [...largeBaseNodes, ...largeFeatureNodes]

const largeBaseEdges: ProjectGraphEdge[] = [
  edge('src/main.ts',         'src/App.vue'),
  edge('src/main.ts',         'src/router/index.ts'),
  edge('src/App.vue',         'src/stores/auth.ts'),
  edge('src/App.vue',         'src/stores/settings.ts'),
  edge('src/services/api.ts', 'src/services/http.ts'),
  edge('src/stores/auth.ts',  'src/services/api.ts'),
  ...features.map(f => edge('src/router/index.ts', `src/views/${f}View.vue`, 'dynamic-import')),
]

const largeFeatureEdges = features.flatMap(makeFeatureEdges)

const largeEdges = [...largeBaseEdges, ...largeFeatureEdges]

export const mockLargeGraph: ProjectGraphResult = {
  workspaceName: 'large-app',
  nodes: largeNodes,
  edges: largeEdges,
  stats: stats(largeNodes, largeEdges),
}
