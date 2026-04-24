import * as path from 'node:path';

import * as ts from 'typescript';
import * as vscode from 'vscode';
import { parse as parseSfc } from '@vue/compiler-sfc';

import type { ProjectGraphEdge, ProjectGraphEdgeKind, ProjectGraphFileKind, ProjectGraphNode, ProjectGraphResult } from '../types/projectGraph';

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
const GRAPH_IGNORED_SEGMENTS = new Set(['node_modules', '.git', 'dist', 'out', 'coverage']);

export async function buildWorkspaceProjectGraph(): Promise<ProjectGraphResult> {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders?.length) {
    return createEmptyGraphResult('Workspace');
  }

  const files = await collectGraphFiles();
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

  const nodes: ProjectGraphNode[] = files
    .map((file) => ({
      id: file.id,
      label: path.posix.basename(file.id),
      path: file.id,
      kind: file.kind,
      importCount: outgoingCounts.get(file.id) ?? 0,
      importedByCount: incomingCounts.get(file.id) ?? 0
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

  const edges = Array.from(edgesById.values()).sort((left, right) => {
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
      edgeCount: edges.length
    }
  };
}

async function collectGraphFiles() {
  const uris = await Promise.all([
    vscode.workspace.findFiles('**/*.vue'),
    vscode.workspace.findFiles('**/*.ts')
  ]);

  const seenPaths = new Set<string>();
  const files: GraphFileEntry[] = [];

  for (const uri of uris.flat()) {
    if (!isGraphFile(uri)) {
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

function resolveAliasBasePath(specifier: string, workspaceRoot: string) {
  if (!specifier.startsWith('@/')) {
    return undefined;
  }

  return path.join(workspaceRoot, 'src', specifier.slice(2));
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
  return {
    compilerOptions: {
      allowJs: true,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      baseUrl: workspaceFolder.uri.fsPath,
      paths: {
        '@/*': ['src/*']
      }
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
  if (normalizedPath.endsWith('.d.ts')) {
    return false;
  }

  const extension = path.extname(normalizedPath);
  if (extension !== '.vue' && extension !== '.ts') {
    return false;
  }

  const segments = normalizedPath.split(path.sep);
  return !segments.some((segment) => GRAPH_IGNORED_SEGMENTS.has(segment));
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
      edgeCount: 0
    }
  };
}