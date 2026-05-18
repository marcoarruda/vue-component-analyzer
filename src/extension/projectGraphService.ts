import * as path from 'node:path';

import * as ts from 'typescript';
import * as vscode from 'vscode';
import { parse as parseSfc } from '@vue/compiler-sfc';

import type { ProjectGraphEdge, ProjectGraphEdgeKind, ProjectGraphFileKind, ProjectGraphNode, ProjectGraphNodeColor, ProjectGraphResult } from '../types/projectGraph';

interface GraphFileEntry {
  id: string;
  fsPath: string;
  kind: ProjectGraphFileKind;
  source: string;
}

interface GraphImportMatch {
  kind: ProjectGraphEdgeKind;
  specifier: string;
}

interface GraphResolutionContext {
  compilerOptions: ts.CompilerOptions;
  host: ts.ModuleResolutionHost;
  workspaceFolder: vscode.WorkspaceFolder;
}

const GRAPH_FILE_EXTENSIONS = ['.vue', '.ts'] as const;
const GRAPH_IGNORED_SEGMENTS = new Set(['node_modules', '.git', 'dist', 'out', 'coverage', '.nuxt', '.output', '.cache']);

export async function buildWorkspaceProjectGraph(): Promise<ProjectGraphResult> {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders?.length) {
    return createEmptyGraphResult('Workspace');
  }

  const files = await collectGraphFiles(workspaceFolders);
  const resolutionContexts = createResolutionContexts(workspaceFolders);
  const edgesById = new Map<string, ProjectGraphEdge>();
  const outgoingCounts = new Map<string, number>();
  const incomingCounts = new Map<string, number>();
  const fileByPath = new Map(files.map((file) => [normalizeFsPath(file.fsPath), file]));

  for (const file of files) {
    const resolutionContext = getResolutionContextForFile(file.fsPath, resolutionContexts);
    for (const graphImport of extractGraphImports(file)) {
      const target = resolveImportTarget(file.fsPath, graphImport.specifier, fileByPath, resolutionContext);
      if (!target || target.id === file.id) {
        continue;
      }

      const edgeId = `${file.id}->${target.id}:${graphImport.kind}:${graphImport.specifier}`;
      if (edgesById.has(edgeId)) {
        continue;
      }

      edgesById.set(edgeId, {
        id: edgeId,
        source: file.id,
        target: target.id,
        kind: graphImport.kind,
        specifier: graphImport.specifier
      });
      outgoingCounts.set(file.id, (outgoingCounts.get(file.id) ?? 0) + 1);
      incomingCounts.set(target.id, (incomingCounts.get(target.id) ?? 0) + 1);
    }
  }

  // Nuxt component auto-imports: components/ files can be used in templates without explicit imports
  const isNuxtProject = workspaceFolders.some((f) => detectNuxtAppRoot(f.uri.fsPath) !== undefined);
  if (isNuxtProject) {
    const nuxtComponentMap = buildNuxtComponentMap(files);
    const connectedPairs = new Set(
      Array.from(edgesById.values()).map((e) => `${e.source}::${e.target}`)
    );

    for (const file of files) {
      if (file.kind !== 'vue') {
        continue;
      }

      for (const componentName of extractTemplateComponentTags(file.source)) {
        const target = nuxtComponentMap.get(componentName);
        if (!target || target.id === file.id) {
          continue;
        }

        const pairKey = `${file.id}::${target.id}`;
        if (connectedPairs.has(pairKey)) {
          continue;
        }

        connectedPairs.add(pairKey);
        const edgeId = `${file.id}->${target.id}:import:${componentName}`;
        edgesById.set(edgeId, {
          id: edgeId,
          source: file.id,
          target: target.id,
          kind: 'import',
          specifier: componentName
        });
        outgoingCounts.set(file.id, (outgoingCounts.get(file.id) ?? 0) + 1);
        incomingCounts.set(target.id, (incomingCounts.get(target.id) ?? 0) + 1);
      }
    }
  }

  const nodesList: ProjectGraphNode[] = files.map((file) => ({
    id: file.id,
    label: path.posix.basename(file.id),
    path: file.id,
    kind: file.kind,
    color: classifyGraphNodeColor(file.id, file.kind),
    importCount: outgoingCounts.get(file.id) ?? 0,
    importedByCount: incomingCounts.get(file.id) ?? 0
  }));

  const edgesList: ProjectGraphEdge[] = Array.from(edgesById.values());

  injectNuxtVirtualRouter(workspaceFolders, nodesList, edgesList);

  const nodes = nodesList.sort((left, right) => left.path.localeCompare(right.path));

  const edges = edgesList.sort((left, right) => {
    const sourceCompare = left.source.localeCompare(right.source);
    if (sourceCompare !== 0) {
      return sourceCompare;
    }

    return left.target.localeCompare(right.target);
  });
  const workspaceName = workspaceFolders.length === 1 ? workspaceFolders[0].name : 'Workspace';

  return {
    workspaceName,
    nodes,
    edges,
    stats: {
      fileCount: nodes.length,
      vueFileCount: nodes.filter((node) => node.kind === 'vue').length,
      tsFileCount: nodes.filter((node) => node.kind === 'ts').length,
      storeFileCount: nodes.filter((node) => node.color === 'store').length,
      serviceFileCount: nodes.filter((node) => node.color === 'service').length,
      viewFileCount: nodes.filter((node) => node.color === 'view').length,
      componentFileCount: nodes.filter((node) => node.color === 'component').length,
      routerFileCount: nodes.filter((node) => node.color === 'router').length,
      edgeCount: edges.length
    }
  };
}

function classifyGraphNodeColor(filePath: string, kind: ProjectGraphFileKind): ProjectGraphNodeColor {
  let normalizedPath = filePath;
  if (normalizedPath.startsWith('src/') || normalizedPath.startsWith('app/')) {
    normalizedPath = normalizedPath.slice(4);
  }

  if (normalizedPath.startsWith('stores/')) {
    return 'store';
  }

  if (normalizedPath.startsWith('services/')) {
    return 'service';
  }

  if (normalizedPath.startsWith('views/') || normalizedPath.startsWith('pages/')) {
    return 'view';
  }

  if (normalizedPath.startsWith('components/')) {
    return 'component';
  }

  if (normalizedPath.startsWith('router/')) {
    return 'router';
  }

  return kind === 'vue' ? 'vue' : 'ts';
}

async function collectGraphFiles(workspaceFolders: readonly vscode.WorkspaceFolder[]) {
  const nuxtAppRootByWorkspace = new Map(
    workspaceFolders.map((folder) => [folder.uri.fsPath, detectNuxtAppRoot(folder.uri.fsPath)])
  );

  const uris = await Promise.all([
    vscode.workspace.findFiles('**/*.vue'),
    vscode.workspace.findFiles('**/*.ts'),
    vscode.workspace.findFiles('**/*.js')
  ]);

  const seenPaths = new Set<string>();
  const files: GraphFileEntry[] = [];

  for (const uri of uris.flat()) {
    if (!isGraphFile(uri)) {
      continue;
    }

    if (!isFileInNuxtAllowedPath(uri.fsPath, workspaceFolders, nuxtAppRootByWorkspace)) {
      continue;
    }

    const normalizedPath = normalizeFsPath(uri.fsPath);
    if (seenPaths.has(normalizedPath)) {
      continue;
    }

    seenPaths.add(normalizedPath);
    const document = await vscode.workspace.openTextDocument(uri);
    files.push({
      id: toWorkspacePath(uri),
      fsPath: uri.fsPath,
      kind: getFileKind(uri),
      source: document.getText()
    });
  }

  return files;
}

function isFileInNuxtAllowedPath(
  fsPath: string,
  workspaceFolders: readonly vscode.WorkspaceFolder[],
  nuxtAppRootByWorkspace: Map<string, string | undefined>
) {
  for (const folder of workspaceFolders) {
    if (!isDescendantPath(fsPath, folder.uri.fsPath)) {
      continue;
    }

    const nuxtAppRoot = nuxtAppRootByWorkspace.get(folder.uri.fsPath);

    // Not a Nuxt project, or Nuxt 3 (app root == workspace root): allow all files
    if (!nuxtAppRoot || nuxtAppRoot === folder.uri.fsPath) {
      return true;
    }

    // Nuxt 4: only allow files under app/
    return isDescendantPath(fsPath, nuxtAppRoot);
  }

  return true;
}

function extractGraphImports(file: GraphFileEntry) {
  const source = file.kind === 'vue' ? extractVueScriptSource(file.source) : file.source;
  const imports: GraphImportMatch[] = [];
  const sourceFile = ts.createSourceFile(
    file.fsPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(file)
  );

  collectImportsFromNode(sourceFile, imports);

  return imports;
}

function collectImportsFromNode(node: ts.Node, matches: GraphImportMatch[]) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    const specifier = getModuleSpecifierText(node.moduleSpecifier);
    if (specifier) {
      matches.push({ kind: 'import', specifier });
    }
  }

  if (ts.isImportEqualsDeclaration(node)) {
    const specifier = ts.isExternalModuleReference(node.moduleReference)
      ? getModuleSpecifierText(node.moduleReference.expression)
      : undefined;
    if (specifier) {
      matches.push({ kind: 'import', specifier });
    }
  }

  if (ts.isCallExpression(node)) {
    const kind = getCallExpressionImportKind(node);
    const specifier = getCallExpressionSpecifier(node);
    if (kind && specifier) {
      matches.push({ kind, specifier });
    }
  }

  ts.forEachChild(node, (child) => collectImportsFromNode(child, matches));
}

function extractVueScriptSource(source: string) {
  const sfc = parseSfc(source);
  return [sfc.descriptor.script?.content, sfc.descriptor.scriptSetup?.content].filter(Boolean).join('\n');
}

function getScriptKind(file: GraphFileEntry) {
  if (file.fsPath.endsWith('.js') || file.fsPath.endsWith('.cjs') || file.fsPath.endsWith('.mjs')) {
    return ts.ScriptKind.JS;
  }

  return ts.ScriptKind.TS;
}

function getModuleSpecifierText(moduleSpecifier: ts.Expression | undefined) {
  return moduleSpecifier && ts.isStringLiteralLike(moduleSpecifier) ? moduleSpecifier.text.trim() : undefined;
}

function getCallExpressionImportKind(node: ts.CallExpression): ProjectGraphEdgeKind | undefined {
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return 'dynamic-import';
  }

  return ts.isIdentifier(node.expression) && node.expression.text === 'require' ? 'dynamic-import' : undefined;
}

function getCallExpressionSpecifier(node: ts.CallExpression) {
  const [firstArgument] = node.arguments;
  return firstArgument && ts.isStringLiteralLike(firstArgument) ? firstArgument.text.trim() : undefined;
}

function resolveImportTarget(
  importerFsPath: string,
  specifier: string,
  fileByPath: Map<string, GraphFileEntry>,
  resolutionContext: GraphResolutionContext
) {
  const resolvedPath = resolveSpecifierToFsPath(importerFsPath, specifier, resolutionContext);
  if (resolvedPath) {
    const target = fileByPath.get(normalizeFsPath(resolvedPath));
    if (target) {
      return target;
    }
  }

  const basePath = specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/')
    ? path.resolve(path.dirname(importerFsPath), specifier)
    : resolveAliasBasePath(specifier, resolutionContext.workspaceFolder.uri.fsPath);

  if (!basePath) {
    return undefined;
  }

  for (const candidate of createResolutionCandidates(basePath)) {
    const target = fileByPath.get(normalizeFsPath(candidate));
    if (target) {
      return target;
    }
  }

  return undefined;
}

function resolveSpecifierToFsPath(importerFsPath: string, specifier: string, resolutionContext: GraphResolutionContext) {
  const resolution = ts.resolveModuleName(
    specifier,
    importerFsPath,
    resolutionContext.compilerOptions,
    resolutionContext.host
  );
  const resolvedFileName = resolution.resolvedModule?.resolvedFileName;

  if (!resolvedFileName) {
    return undefined;
  }

  const normalizedPath = normalizeFsPath(resolvedFileName);
  return normalizedPath.endsWith('.d.ts') ? undefined : normalizedPath;
}

const NUXT_VIRTUAL_ROUTER_ID = '__nuxt-router__';

function buildNuxtComponentMap(files: GraphFileEntry[]): Map<string, GraphFileEntry> {
  const map = new Map<string, GraphFileEntry>();

  for (const file of files) {
    if (file.kind !== 'vue') {
      continue;
    }

    const componentName = nuxtAutoImportComponentName(file.id);
    if (componentName) {
      map.set(componentName, file);
    }
  }

  return map;
}

function nuxtAutoImportComponentName(workspacePath: string): string | undefined {
  // Matches app/components/..., src/components/..., or components/...
  const match = workspacePath.match(/^(?:app\/|src\/)?components\/(.+)\.vue$/);
  if (!match) {
    return undefined;
  }

  const segments = match[1].split('/');
  return segments.map((segment) => segmentToPascalCase(segment)).join('');
}

function extractTemplateComponentTags(source: string): Set<string> {
  const sfc = parseSfc(source);
  const templateContent = sfc.descriptor.template?.content;
  if (!templateContent) {
    return new Set();
  }

  const tags = new Set<string>();
  // Match PascalCase tags (<MyComponent) and multi-segment kebab-case tags (<my-component)
  const tagRegex = /<([A-Z][a-zA-Z0-9.]*|[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)+)[\s\/>]/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(templateContent)) !== null) {
    const rawTag = match[1];
    const componentName = rawTag.includes('-') ? kebabToPascalCase(rawTag) : rawTag;
    // Strip Lazy prefix added by Nuxt for lazy-loaded variants
    const cleanName = componentName.startsWith('Lazy') ? componentName.slice(4) : componentName;
    tags.add(cleanName);
  }

  return tags;
}

function segmentToPascalCase(segment: string): string {
  return segment
    .split(/[-_]/)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ''))
    .join('');
}

function kebabToPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ''))
    .join('');
}

function injectNuxtVirtualRouter(
  workspaceFolders: readonly vscode.WorkspaceFolder[],
  nodes: ProjectGraphNode[],
  edges: ProjectGraphEdge[]
) {
  const isNuxtProject = workspaceFolders.some(
    (folder) => detectNuxtAppRoot(folder.uri.fsPath) !== undefined
  );

  if (!isNuxtProject) {
    return;
  }

  // Already has an explicit router — don't add a placeholder
  const hasExplicitRouter = nodes.some((node) => node.color === 'router');
  if (hasExplicitRouter) {
    return;
  }

  const pageNodes = nodes.filter((node) => node.color === 'view');
  if (pageNodes.length === 0) {
    return;
  }

  const virtualNode: ProjectGraphNode = {
    id: NUXT_VIRTUAL_ROUTER_ID,
    label: 'Nuxt Router',
    path: NUXT_VIRTUAL_ROUTER_ID,
    kind: 'ts',
    color: 'router',
    virtual: true,
    importCount: pageNodes.length,
    importedByCount: 0
  };

  nodes.push(virtualNode);

  for (const pageNode of pageNodes) {
    const edgeId = `${NUXT_VIRTUAL_ROUTER_ID}->${pageNode.id}:import`;
    edges.push({
      id: edgeId,
      source: NUXT_VIRTUAL_ROUTER_ID,
      target: pageNode.id,
      kind: 'import',
      specifier: pageNode.path
    });
    pageNode.importedByCount++;
  }
}

function detectNuxtAppRoot(workspaceRoot: string): string | undefined {
  const hasNuxtConfig = ts.sys.fileExists(path.join(workspaceRoot, 'nuxt.config.ts'))
    || ts.sys.fileExists(path.join(workspaceRoot, 'nuxt.config.js'))
    || ts.sys.fileExists(path.join(workspaceRoot, 'nuxt.config.mts'))
    || ts.sys.fileExists(path.join(workspaceRoot, 'nuxt.config.mjs'));

  if (!hasNuxtConfig) {
    return undefined;
  }

  // Nuxt 4 default: source lives under app/
  if (ts.sys.directoryExists(path.join(workspaceRoot, 'app'))) {
    return path.join(workspaceRoot, 'app');
  }

  // Nuxt 3: aliases point to the project root
  return workspaceRoot;
}

function resolveAliasBasePath(specifier: string, workspaceRoot: string) {
  // ~~ and @@ always resolve to the project root in both Nuxt 3 and 4
  if (specifier.startsWith('~~/') || specifier.startsWith('@@/')) {
    return path.join(workspaceRoot, specifier.slice(3));
  }

  // @ and ~ resolve to the Nuxt app directory (app/ in Nuxt 4, root in Nuxt 3, src/ otherwise)
  if (specifier.startsWith('@/') || specifier.startsWith('~/')) {
    const nuxtAppRoot = detectNuxtAppRoot(workspaceRoot);
    const appRoot = nuxtAppRoot ?? path.join(workspaceRoot, 'src');
    return path.join(appRoot, specifier.slice(2));
  }

  return undefined;
}

function createResolutionContexts(workspaceFolders: readonly vscode.WorkspaceFolder[]) {
  return workspaceFolders.map((workspaceFolder) => {
    const configPath = ts.findConfigFile(workspaceFolder.uri.fsPath, ts.sys.fileExists, 'tsconfig.json')
      ?? ts.findConfigFile(workspaceFolder.uri.fsPath, ts.sys.fileExists, 'jsconfig.json');

    if (!configPath) {
      return createFallbackResolutionContext(workspaceFolder);
    }

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) {
      return createFallbackResolutionContext(workspaceFolder);
    }

    const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
    return {
      compilerOptions: parsedConfig.options,
      host: ts.sys,
      workspaceFolder
    } satisfies GraphResolutionContext;
  });
}

function createFallbackResolutionContext(workspaceFolder: vscode.WorkspaceFolder): GraphResolutionContext {
  const workspaceRoot = workspaceFolder.uri.fsPath;
  const nuxtAppRoot = detectNuxtAppRoot(workspaceRoot);
  const appAliasGlob = nuxtAppRoot
    ? path.relative(workspaceRoot, nuxtAppRoot).replace(/\\/g, '/') + '/*'
    : 'src/*';

  const paths: Record<string, string[]> = {
    '@/*': [appAliasGlob],
    '~/*': [appAliasGlob]
  };

  if (nuxtAppRoot) {
    paths['@@/*'] = ['*'];
    paths['~~/*'] = ['*'];
  }

  return {
    compilerOptions: {
      allowJs: true,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      baseUrl: workspaceRoot,
      paths
    },
    host: ts.sys,
    workspaceFolder
  };
}

function getResolutionContextForFile(filePath: string, resolutionContexts: readonly GraphResolutionContext[]) {
  const matchingContext = resolutionContexts.find((context) => isDescendantPath(filePath, context.workspaceFolder.uri.fsPath));
  return matchingContext ?? resolutionContexts[0];
}

function isDescendantPath(candidatePath: string, parentPath: string) {
  const relativePath = path.relative(parentPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function createResolutionCandidates(basePath: string) {
  const extension = path.extname(basePath);
  const candidates = new Set<string>();

  if (extension) {
    candidates.add(basePath);

    if (extension === '.js' || extension === '.mjs' || extension === '.cjs') {
      candidates.add(basePath.slice(0, -extension.length) + '.ts');
    }
  } else {
    for (const fileExtension of GRAPH_FILE_EXTENSIONS) {
      candidates.add(`${basePath}${fileExtension}`);
      candidates.add(path.join(basePath, `index${fileExtension}`));
    }
  }

  return candidates;
}

function isGraphFile(uri: vscode.Uri) {
  if (uri.scheme !== 'file') {
    return false;
  }

  const normalizedPath = normalizeFsPath(uri.fsPath);
  const normalizedLowerPath = normalizedPath.toLowerCase();
  if (normalizedPath.endsWith('.d.ts')) {
    return false;
  }

  const extension = path.extname(normalizedPath);
  if (extension === '.js') {
    if (!isTestOrStoryFile(normalizedLowerPath)) {
      return false;
    }
  } else if (extension !== '.vue' && extension !== '.ts') {
    return false;
  }

  const segments = normalizedPath.split(path.sep);
  return !segments.some((segment) => GRAPH_IGNORED_SEGMENTS.has(segment));
}

function isTestOrStoryFile(normalizedLowerPath: string) {
  const segments = normalizedLowerPath.split(path.sep);
  const fileName = path.basename(normalizedLowerPath);

  return segments.includes('__tests__')
    || segments.includes('.storybook')
    || segments.includes('.histoire')
    || fileName === 'spec.js'
    || fileName.startsWith('histoire.')
    || normalizedLowerPath.endsWith('.spec.ts')
    || normalizedLowerPath.endsWith('.spec.js')
    || normalizedLowerPath.endsWith('.stories.ts')
    || normalizedLowerPath.endsWith('.stories.js')
    || normalizedLowerPath.endsWith('.stories.vue')
    || normalizedLowerPath.endsWith('.story.ts')
    || normalizedLowerPath.endsWith('.story.js')
    || normalizedLowerPath.endsWith('.story.vue');
}

function getFileKind(uri: vscode.Uri): ProjectGraphFileKind {
  return uri.fsPath.endsWith('.vue') ? 'vue' : 'ts';
}

function normalizeFsPath(fsPath: string) {
  return path.normalize(fsPath);
}

function toWorkspacePath(uri: vscode.Uri) {
  const relativePath = vscode.workspace.asRelativePath(uri, false);
  return relativePath ? relativePath.split(path.sep).join(path.posix.sep) : uri.fsPath.split(path.sep).join(path.posix.sep);
}

function createEmptyGraphResult(workspaceName: string): ProjectGraphResult {
  return {
    workspaceName,
    nodes: [],
    edges: [],
    stats: {
      fileCount: 0,
      vueFileCount: 0,
      tsFileCount: 0,
      storeFileCount: 0,
      serviceFileCount: 0,
      viewFileCount: 0,
      componentFileCount: 0,
      routerFileCount: 0,
      edgeCount: 0
    }
  };
}