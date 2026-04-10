import * as path from 'path';

import { parse as parseScript } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import {
  NodeTypes,
  parse as parseTemplate,
  type ElementNode,
  type RootNode,
  type TemplateChildNode
} from '@vue/compiler-dom';
import { parse as parseSfc, type SFCDescriptor } from '@vue/compiler-sfc';

import type { AnalysisDetailItem, ComponentAnalysisResult } from '../types/analysis';

export interface AnalyzerInput {
  filePath: string;
  source: string;
}

interface ScriptAnalysis {
  props: Set<string>;
  propDetails: Map<string, string | undefined>;
  emits: Set<string>;
  slots: Set<string>;
  models: Set<string>;
  modelDetails: Map<string, string | undefined>;
  injects: Set<string>;
  provides: Set<string>;
  stores: Set<string>;
  apiCalls: Set<string>;
  exposed: Set<string>;
  refs: Set<string>;
  computed: Set<string>;
  watchers: string[];
  watcherDetails: AnalysisDetailItem[];
  methods: Set<string>;
  warnings: string[];
}

interface TemplateAnalysis {
  slots: Set<string>;
  slotProps: Set<string>;
}

const BABEL_PLUGINS: NonNullable<Parameters<typeof parseScript>[1]>['plugins'] = ['typescript', 'jsx'];

export function analyzeVueSfcComponent(input: AnalyzerInput): ComponentAnalysisResult {
  const sfc = parseSfc(input.source, { filename: input.filePath });
  const warnings = sfc.errors.map((error) => stringifySfcError(error));
  const scriptAnalysis = analyzeScripts(sfc.descriptor, input.filePath);
  const templateAnalysis = analyzeTemplateBlock(sfc.descriptor.template?.content);

  warnings.push(...scriptAnalysis.warnings);

  const external = {
    props: sortValues(scriptAnalysis.props),
    emits: sortValues(scriptAnalysis.emits),
    slots: sortValues(mergeSets(scriptAnalysis.slots, templateAnalysis.slots)),
    models: sortValues(scriptAnalysis.models),
    injects: sortValues(scriptAnalysis.injects),
    provides: sortValues(scriptAnalysis.provides),
    stores: sortValues(scriptAnalysis.stores),
    apiCalls: sortValues(scriptAnalysis.apiCalls),
    exposed: sortValues(scriptAnalysis.exposed),
    slotProps: sortValues(templateAnalysis.slotProps)
  };

  const internal = {
    refs: sortValues(scriptAnalysis.refs),
    computed: sortValues(scriptAnalysis.computed),
    watchers: sortValues(scriptAnalysis.watchers),
    methods: sortValues(scriptAnalysis.methods)
  };

  const details = {
    external: {
      props: sortDetailedValues(external.props, scriptAnalysis.propDetails),
      emits: toDetailItems(external.emits),
      slots: toDetailItems(external.slots),
      models: sortDetailedValues(external.models, scriptAnalysis.modelDetails),
      injects: toDetailItems(external.injects),
      provides: toDetailItems(external.provides),
      stores: toDetailItems(external.stores),
      apiCalls: toDetailItems(external.apiCalls),
      exposed: toDetailItems(external.exposed),
      slotProps: toDetailItems(external.slotProps)
    },
    internal: {
      refs: toDetailItems(internal.refs),
      computed: toDetailItems(internal.computed),
      watchers: sortAnalysisDetailItems(scriptAnalysis.watcherDetails),
      methods: toDetailItems(internal.methods)
    }
  };

  return {
    component: {
      name: inferComponentName(input.filePath),
      path: input.filePath
    },
    external,
    internal,
    details,
    scores: scoreAnalysis(external, internal),
    meta: {
      warnings,
      version: 1
    }
  };
}

function analyzeScripts(descriptor: SFCDescriptor, filePath: string): ScriptAnalysis {
  const analysis = createEmptyScriptAnalysis();
  const typeDeclarations = new Map<string, t.TSType>();
  const blocks = [descriptor.script?.content, descriptor.scriptSetup?.content].filter(
    (value): value is string => Boolean(value?.trim())
  );

  for (const block of blocks) {
    try {
      const ast = parseScript(block, {
        sourceType: 'module',
        plugins: BABEL_PLUGINS
      });

      traverse(ast, {
        TSInterfaceDeclaration(path) {
          typeDeclarations.set(path.node.id.name, t.tsTypeLiteral(path.node.body.body));
        },
        TSTypeAliasDeclaration(path) {
          typeDeclarations.set(path.node.id.name, path.node.typeAnnotation);
        },
        VariableDeclarator(path) {
          collectVariableMetrics(path.node, analysis);
        },
        FunctionDeclaration(path) {
          if (path.node.id?.name) {
            analysis.methods.add(path.node.id.name);
          }
        },
        CallExpression(path) {
          collectCallMetrics(path.node, analysis, typeDeclarations);
        }
      });
    } catch (error) {
      analysis.warnings.push(`Script parse error in ${filePath}: ${stringifyUnknownError(error)}`);
    }
  }

  return analysis;
}

function analyzeTemplateBlock(templateSource: string | undefined): TemplateAnalysis {
  const slots = new Set<string>();
  const slotProps = new Set<string>();

  if (!templateSource?.trim()) {
    return { slots, slotProps };
  }

  walkTemplate(parseTemplate(templateSource), slots, slotProps);
  return { slots, slotProps };
}

function walkTemplate(node: RootNode | TemplateChildNode, slots: Set<string>, slotProps: Set<string>) {
  switch (node.type) {
    case NodeTypes.ROOT:
    case NodeTypes.ELEMENT:
      if (node.type === NodeTypes.ELEMENT && node.tag === 'slot') {
        slots.add(getSlotName(node));

        for (const prop of node.props) {
          if (prop.type !== NodeTypes.DIRECTIVE || prop.name !== 'bind') {
            continue;
          }

          if (prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION && prop.arg.content !== 'name') {
            slotProps.add(prop.arg.content);
          }

          if (!prop.arg) {
            slotProps.add('spread');
          }
        }
      }

      for (const child of node.children) {
        walkTemplate(child, slots, slotProps);
      }
      return;
    case NodeTypes.IF:
      for (const branch of node.branches) {
        walkTemplate(branch, slots, slotProps);
      }
      return;
    case NodeTypes.IF_BRANCH:
    case NodeTypes.FOR:
      for (const child of node.children) {
        walkTemplate(child, slots, slotProps);
      }
      return;
    default:
      return;
  }
}

function getSlotName(node: ElementNode) {
  for (const prop of node.props) {
    if (prop.type === NodeTypes.ATTRIBUTE && prop.name === 'name') {
      return prop.value?.content || 'default';
    }

    if (
      prop.type === NodeTypes.DIRECTIVE &&
      prop.name === 'bind' &&
      prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION &&
      prop.arg.content === 'name'
    ) {
      return prop.exp?.type === NodeTypes.SIMPLE_EXPRESSION ? prop.exp.content : 'dynamic';
    }
  }

  return 'default';
}

function collectVariableMetrics(node: t.VariableDeclarator, analysis: ScriptAnalysis) {
  if (!t.isIdentifier(node.id) || !node.init || !t.isCallExpression(node.init)) {
    return;
  }

  const callName = getCalleeName(node.init.callee);

  if (callName === 'ref' || callName === 'shallowRef' || callName === 'customRef') {
    analysis.refs.add(node.id.name);
    return;
  }

  if (callName === 'computed') {
    analysis.computed.add(node.id.name);
    return;
  }

  if (isStoreComposableName(callName)) {
    analysis.stores.add(callName as string);
  }
}

function collectCallMetrics(node: t.CallExpression, analysis: ScriptAnalysis, types: Map<string, t.TSType>) {
  const callName = getCalleeName(node.callee);

  switch (callName) {
    case 'defineProps':
      mergeDetails(analysis.propDetails, extractPropDetails(node, types));
      addAll(analysis.props, analysis.propDetails.keys());
      return;
    case 'defineEmits':
      addAll(analysis.emits, extractEmitEntries(node, types));
      return;
    case 'defineModel':
      {
        const modelDetail = extractModelDetail(node);
        analysis.models.add(modelDetail.name);
        analysis.modelDetails.set(modelDetail.name, modelDetail.type);
      }
      return;
    case 'defineExpose':
      addAll(analysis.exposed, extractExposeEntries(node));
      return;
    case 'defineSlots':
      addAll(analysis.slots, extractSlotEntries(node, types));
      return;
    case 'inject':
      analysis.injects.add(extractNamedKey(node.arguments[0], 'inject'));
      return;
    case 'provide':
      analysis.provides.add(extractNamedKey(node.arguments[0], 'provide'));
      return;
    case 'watch':
    case 'watchEffect':
    case 'watchPostEffect':
    case 'watchSyncEffect':
      analysis.watchers.push(callName);
      analysis.watcherDetails.push(extractWatcherDetail(node, callName));
      return;
    case 'fetch':
      analysis.apiCalls.add('fetch');
      return;
    default:
      break;
  }

  if (isStoreComposableName(callName)) {
    analysis.stores.add(callName as string);
    return;
  }

  const apiCall = extractApiCallName(node.callee);
  if (apiCall) {
    analysis.apiCalls.add(apiCall);
  }
}

function extractMacroEntries(call: t.CallExpression, types: Map<string, t.TSType>, fallbackPrefix: string) {
  const entries = new Set<string>();
  const [firstArgument] = call.arguments;

  if (t.isObjectExpression(firstArgument)) {
    addAll(entries, extractObjectKeys(firstArgument.properties, fallbackPrefix));
  }

  addAll(entries, extractTypeEntries(getCallTypes(call), types, fallbackPrefix));

  if (entries.size === 0 && firstArgument) {
    entries.add(fallbackPrefix);
  }

  return entries;
}

function extractPropDetails(call: t.CallExpression, types: Map<string, t.TSType>) {
  const entries = new Map<string, string | undefined>();
  const [firstArgument] = call.arguments;

  if (t.isObjectExpression(firstArgument)) {
    mergeDetails(entries, extractObjectPropDetails(firstArgument.properties, 'prop'));
  }

  mergeDetails(entries, extractTypeDetailEntries(getCallTypes(call), types, 'prop'));

  if (entries.size === 0 && firstArgument) {
    entries.set('prop', undefined);
  }

  return entries;
}

function extractEmitEntries(call: t.CallExpression, types: Map<string, t.TSType>) {
  const entries = new Set<string>();
  const [firstArgument] = call.arguments;

  if (t.isArrayExpression(firstArgument)) {
    for (const element of firstArgument.elements) {
      if (t.isStringLiteral(element)) {
        entries.add(element.value);
      }
    }
  }

  if (t.isObjectExpression(firstArgument)) {
    addAll(entries, extractObjectKeys(firstArgument.properties, 'emit'));
  }

  addAll(entries, extractEmitTypes(getCallTypes(call), types));

  if (entries.size === 0 && firstArgument) {
    entries.add('emit');
  }

  return entries;
}

function extractExposeEntries(call: t.CallExpression) {
  const entries = new Set<string>();
  const [firstArgument] = call.arguments;

  if (t.isObjectExpression(firstArgument)) {
    addAll(entries, extractObjectKeys(firstArgument.properties, 'exposed'));
  }

  return entries;
}

function extractSlotEntries(call: t.CallExpression, types: Map<string, t.TSType>) {
  return extractTypeEntries(getCallTypes(call), types, 'slot');
}

function extractModelName(call: t.CallExpression) {
  const [firstArgument] = call.arguments;

  if (t.isStringLiteral(firstArgument)) {
    return firstArgument.value;
  }

  if (t.isIdentifier(firstArgument)) {
    return firstArgument.name;
  }

  return 'modelValue';
}

function extractModelDetail(call: t.CallExpression): AnalysisDetailItem {
  const typeNode = getCallTypes(call)[0];

  return {
    name: extractModelName(call),
    type: typeNode ? stringifyTypeNode(typeNode) : undefined
  };
}

function extractNamedKey(argument: t.CallExpression['arguments'][number] | undefined, fallback: string) {
  if (!argument) {
    return fallback;
  }

  if (t.isStringLiteral(argument)) {
    return argument.value;
  }

  if (t.isIdentifier(argument)) {
    return argument.name;
  }

  if (t.isTemplateLiteral(argument) && argument.expressions.length === 0) {
    return argument.quasis[0]?.value.cooked || fallback;
  }

  return fallback;
}

function extractWatcherDetail(call: t.CallExpression, callName: string): AnalysisDetailItem {
  return {
    name: callName,
    type: extractWatchSource(call, callName)
  };
}

function extractWatchSource(call: t.CallExpression, callName: string) {
  if (callName !== 'watch') {
    return undefined;
  }

  const [source] = call.arguments;
  return stringifyReactiveSource(source);
}

function stringifyReactiveSource(node: t.CallExpression['arguments'][number] | undefined): string | undefined {
  if (!node) {
    return undefined;
  }

  if (t.isTSAsExpression(node) || t.isTSTypeAssertion(node)) {
    return stringifyReactiveSource(node.expression);
  }

  if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
    if (node.params.length > 0) {
      return 'effect';
    }

    if (t.isBlockStatement(node.body)) {
      return 'getter';
    }

    return stringifyReactiveSource(node.body);
  }

  if (t.isIdentifier(node)) {
    return node.name;
  }

  if (t.isStringLiteral(node)) {
    return `'${node.value}'`;
  }

  if (t.isNumericLiteral(node) || t.isBigIntLiteral(node)) {
    return String(node.value);
  }

  if (node.type === 'BooleanLiteral') {
    return node.value ? 'true' : 'false';
  }

  if (t.isTemplateLiteral(node)) {
    return node.expressions.length === 0 ? `\`${node.quasis[0]?.value.cooked || ''}\`` : 'template';
  }

  if (t.isArrayExpression(node)) {
    const members = node.elements
      .map((element) => stringifyReactiveSource(element))
      .filter((value): value is string => Boolean(value));

    return members.length > 0 ? `[${members.join(', ')}]` : '[]';
  }

  if (t.isMemberExpression(node) && !node.computed) {
    const objectName = stringifyReactiveSource(node.object);
    const propertyName = t.isIdentifier(node.property) ? node.property.name : undefined;

    return objectName && propertyName ? `${objectName}.${propertyName}` : undefined;
  }

  if (t.isOptionalMemberExpression(node) && !node.computed) {
    const objectName = stringifyReactiveSource(node.object);
    const propertyName = t.isIdentifier(node.property) ? node.property.name : undefined;

    return objectName && propertyName ? `${objectName}?.${propertyName}` : undefined;
  }

  if (t.isCallExpression(node)) {
    const calleeName = getCalleeName(node.callee);
    return calleeName ? `${calleeName}(...)` : 'call';
  }

  return undefined;
}

function extractTypeEntries(types: readonly t.TSType[], knownTypes: Map<string, t.TSType>, fallbackPrefix: string) {
  const entries = new Set<string>();

  for (const typeNode of types) {
    addAll(entries, extractTypeNodeEntries(typeNode, knownTypes, fallbackPrefix));
  }

  return entries;
}

function extractTypeDetailEntries(types: readonly t.TSType[], knownTypes: Map<string, t.TSType>, fallbackPrefix: string) {
  const entries = new Map<string, string | undefined>();

  for (const typeNode of types) {
    mergeDetails(entries, extractTypeNodeDetails(typeNode, knownTypes, fallbackPrefix));
  }

  return entries;
}

function extractEmitTypes(types: readonly t.TSType[], knownTypes: Map<string, t.TSType>) {
  const entries = new Set<string>();

  for (const typeNode of types) {
    if (t.isTSTypeLiteral(typeNode)) {
      for (const member of typeNode.members) {
        if (t.isTSCallSignatureDeclaration(member)) {
          const firstParameter = member.parameters[0];
          const eventName = extractEventName(firstParameter);
          if (eventName) {
            entries.add(eventName);
          }
        }

        if (t.isTSPropertySignature(member)) {
          const key = getPropertyKeyName(member.key);
          if (key) {
            entries.add(key);
          }
        }
      }
    }

    if (t.isTSTypeReference(typeNode)) {
      const resolved = resolveTypeReference(typeNode, knownTypes);
      if (resolved) {
        addAll(entries, extractEmitTypes([resolved], knownTypes));
      }
    }
  }

  return entries;
}

function extractEventName(parameter: t.Identifier | t.RestElement | t.Pattern | t.TSParameterProperty | undefined) {
  if (!parameter || !t.isIdentifier(parameter) || !parameter.typeAnnotation) {
    return undefined;
  }

  if (!t.isTSTypeAnnotation(parameter.typeAnnotation)) {
    return undefined;
  }

  const annotation = parameter.typeAnnotation.typeAnnotation;
  if (t.isTSLiteralType(annotation) && t.isStringLiteral(annotation.literal)) {
    return annotation.literal.value;
  }

  return undefined;
}

function extractTypeNodeEntries(typeNode: t.TSType, knownTypes: Map<string, t.TSType>, fallbackPrefix: string): Set<string> {
  if (t.isTSTypeLiteral(typeNode)) {
    return new Set(
      typeNode.members
        .map((member) => (t.isTSPropertySignature(member) ? getPropertyKeyName(member.key) : undefined))
        .filter((value): value is string => Boolean(value))
    );
  }

  if (t.isTSIntersectionType(typeNode) || t.isTSUnionType(typeNode)) {
    const entries = new Set<string>();
    for (const nested of typeNode.types) {
      addAll(entries, extractTypeNodeEntries(nested, knownTypes, fallbackPrefix));
    }
    return entries;
  }

  if (t.isTSTypeReference(typeNode)) {
    const resolved = resolveTypeReference(typeNode, knownTypes);
    if (resolved) {
      return extractTypeNodeEntries(resolved, knownTypes, fallbackPrefix);
    }
  }

  return new Set([fallbackPrefix]);
}

function extractTypeNodeDetails(
  typeNode: t.TSType,
  knownTypes: Map<string, t.TSType>,
  fallbackPrefix: string
) {
  if (t.isTSTypeLiteral(typeNode)) {
    const entries = new Map<string, string | undefined>();

    for (const member of typeNode.members) {
      if (!t.isTSPropertySignature(member)) {
        continue;
      }

      const key = getPropertyKeyName(member.key);
      if (!key) {
        continue;
      }

      entries.set(key, member.typeAnnotation ? stringifyTypeNode(member.typeAnnotation.typeAnnotation) : undefined);
    }

    return entries;
  }

  if (t.isTSIntersectionType(typeNode) || t.isTSUnionType(typeNode)) {
    const entries = new Map<string, string | undefined>();

    for (const nested of typeNode.types) {
      mergeDetails(entries, extractTypeNodeDetails(nested, knownTypes, fallbackPrefix));
    }

    return entries;
  }

  if (t.isTSTypeReference(typeNode)) {
    const resolved = resolveTypeReference(typeNode, knownTypes);
    if (resolved) {
      return extractTypeNodeDetails(resolved, knownTypes, fallbackPrefix);
    }
  }

  return new Map([[fallbackPrefix, stringifyTypeNode(typeNode)]]);
}

function extractObjectKeys(properties: Array<t.ObjectMethod | t.ObjectProperty | t.SpreadElement>, fallbackPrefix: string) {
  const entries = new Set<string>();

  for (const property of properties) {
    if (t.isSpreadElement(property)) {
      entries.add(fallbackPrefix);
      continue;
    }

    const key = getPropertyKeyName(property.key);
    entries.add(key || fallbackPrefix);
  }

  return entries;
}

function extractObjectPropDetails(
  properties: Array<t.ObjectMethod | t.ObjectProperty | t.SpreadElement>,
  fallbackPrefix: string
) {
  const entries = new Map<string, string | undefined>();

  for (const property of properties) {
    if (t.isSpreadElement(property)) {
      entries.set(fallbackPrefix, undefined);
      continue;
    }

    const key = getPropertyKeyName(property.key);
    if (!key) {
      entries.set(fallbackPrefix, undefined);
      continue;
    }

    const type = t.isObjectProperty(property) ? inferRuntimePropType(property.value) : undefined;
    entries.set(key, type);
  }

  return entries;
}

function extractApiCallName(callee: t.Expression | t.V8IntrinsicIdentifier) {
  if (!t.isMemberExpression(callee) || callee.computed) {
    return undefined;
  }

  const objectName = t.isIdentifier(callee.object) ? callee.object.name : undefined;
  const propertyName = t.isIdentifier(callee.property) ? callee.property.name : undefined;

  if (!objectName || !propertyName) {
    return undefined;
  }

  if (!['axios', 'api', 'http', 'client'].includes(objectName)) {
    return undefined;
  }

  if (!['get', 'post', 'put', 'patch', 'delete'].includes(propertyName)) {
    return undefined;
  }

  return `${objectName}.${propertyName}`;
}

function getPropertyKeyName(node: t.Expression | t.Identifier | t.PrivateName | t.StringLiteral | t.NumericLiteral | t.BigIntLiteral) {
  if (t.isIdentifier(node)) {
    return node.name;
  }

  if (t.isStringLiteral(node) || t.isNumericLiteral(node) || t.isBigIntLiteral(node)) {
    return String(node.value);
  }

  return undefined;
}

function inferRuntimePropType(node: t.Node): string | undefined {
  if (t.isIdentifier(node) && isRuntimeTypeName(node.name)) {
    return node.name;
  }

  if (t.isTSAsExpression(node) || t.isTSTypeAssertion(node)) {
    return inferRuntimePropType(node.expression);
  }

  if (t.isArrayExpression(node)) {
    const members = node.elements
      .map((element) => (element ? inferRuntimePropType(element) : undefined))
      .filter((value): value is string => Boolean(value));

    return members.length > 0 ? members.join(' | ') : undefined;
  }

  if (t.isObjectExpression(node)) {
    for (const property of node.properties) {
      if (!t.isObjectProperty(property)) {
        continue;
      }

      const key = getPropertyKeyName(property.key);
      if (key === 'type') {
        return inferRuntimePropType(property.value);
      }
    }
  }

  return undefined;
}

function isRuntimeTypeName(value: string) {
  return ['String', 'Number', 'Boolean', 'Array', 'Object', 'Function', 'Date', 'Symbol'].includes(value);
}

function stringifyTypeNode(typeNode: t.TSType): string {
  if (t.isTSStringKeyword(typeNode)) {
    return 'string';
  }

  if (t.isTSNumberKeyword(typeNode)) {
    return 'number';
  }

  if (t.isTSBooleanKeyword(typeNode)) {
    return 'boolean';
  }

  if (t.isTSAnyKeyword(typeNode)) {
    return 'any';
  }

  if (t.isTSUnknownKeyword(typeNode)) {
    return 'unknown';
  }

  if (t.isTSVoidKeyword(typeNode)) {
    return 'void';
  }

  if (t.isTSNullKeyword(typeNode)) {
    return 'null';
  }

  if (t.isTSUndefinedKeyword(typeNode)) {
    return 'undefined';
  }

  if (t.isTSNeverKeyword(typeNode)) {
    return 'never';
  }

  if (t.isTSLiteralType(typeNode)) {
    if (t.isStringLiteral(typeNode.literal)) {
      return `'${typeNode.literal.value}'`;
    }

    if (t.isNumericLiteral(typeNode.literal) || t.isBigIntLiteral(typeNode.literal)) {
      return String(typeNode.literal.value);
    }

    if (typeNode.literal.type === 'BooleanLiteral') {
      return typeNode.literal.value ? 'true' : 'false';
    }
  }

  if (t.isTSUnionType(typeNode)) {
    return typeNode.types.map((member) => stringifyTypeNode(member)).join(' | ');
  }

  if (t.isTSIntersectionType(typeNode)) {
    return typeNode.types.map((member) => stringifyTypeNode(member)).join(' & ');
  }

  if (t.isTSArrayType(typeNode)) {
    return `${stringifyTypeNode(typeNode.elementType)}[]`;
  }

  if (t.isTSTupleType(typeNode)) {
    return `[${typeNode.elementTypes.map((member) => stringifyTupleMember(member)).join(', ')}]`;
  }

  if (t.isTSParenthesizedType(typeNode)) {
    return `(${stringifyTypeNode(typeNode.typeAnnotation)})`;
  }

  if (t.isTSTypeReference(typeNode)) {
    const typeName = stringifyTypeName(typeNode.typeName);
    const params = typeNode.typeParameters?.params.map((member) => stringifyTypeNode(member)) ?? [];
    return params.length > 0 ? `${typeName}<${params.join(', ')}>` : typeName;
  }

  if (t.isTSTypeLiteral(typeNode)) {
    return '{ ... }';
  }

  if (t.isTSFunctionType(typeNode)) {
    return '(...args) => unknown';
  }

  return 'unknown';
}

function stringifyTypeName(node: t.TSEntityName): string {
  if (t.isIdentifier(node)) {
    return node.name;
  }

  return `${stringifyTypeName(node.left)}.${node.right.name}`;
}

function stringifyTupleMember(member: t.TSType | t.TSNamedTupleMember): string {
  if (t.isTSNamedTupleMember(member)) {
    return `${member.label.name}: ${stringifyTypeNode(member.elementType)}`;
  }

  return stringifyTypeNode(member);
}

function getCallTypes(call: t.CallExpression) {
  const typeParameters = 'typeParameters' in call ? call.typeParameters : undefined;
  return typeParameters && t.isTSTypeParameterInstantiation(typeParameters) ? typeParameters.params : [];
}

function getCalleeName(callee: t.Expression | t.V8IntrinsicIdentifier): string | undefined {
  if (t.isIdentifier(callee)) {
    return callee.name;
  }

  if (t.isMemberExpression(callee) && !callee.computed && t.isIdentifier(callee.property)) {
    return callee.property.name;
  }

  return undefined;
}

function resolveTypeReference(typeNode: t.TSTypeReference, knownTypes: Map<string, t.TSType>) {
  const referenceName = getQualifiedName(typeNode.typeName);
  return referenceName ? knownTypes.get(referenceName) : undefined;
}

function getQualifiedName(typeName: t.TSEntityName): string | undefined {
  if (t.isIdentifier(typeName)) {
    return typeName.name;
  }

  if (t.isTSQualifiedName(typeName)) {
    const left = getQualifiedName(typeName.left);
    return left ? `${left}.${typeName.right.name}` : typeName.right.name;
  }

  return undefined;
}

function isStoreComposableName(name: string | undefined) {
  return Boolean(name && /^use[A-Z]\w*Store$/.test(name));
}

function scoreAnalysis(external: ComponentAnalysisResult['external'], internal: ComponentAnalysisResult['internal']) {
  const externalScore = Object.values(external).reduce((total, values) => total + values.length, 0);
  const internalScore = Object.values(internal).reduce((total, values) => total + values.length, 0);
  const total = externalScore + internalScore;

  return {
    external: externalScore,
    internal: internalScore,
    total
  };
}

function createEmptyScriptAnalysis(): ScriptAnalysis {
  return {
    props: new Set<string>(),
    propDetails: new Map<string, string | undefined>(),
    emits: new Set<string>(),
    slots: new Set<string>(),
    models: new Set<string>(),
    modelDetails: new Map<string, string | undefined>(),
    injects: new Set<string>(),
    provides: new Set<string>(),
    stores: new Set<string>(),
    apiCalls: new Set<string>(),
    exposed: new Set<string>(),
    refs: new Set<string>(),
    computed: new Set<string>(),
    watchers: [],
    watcherDetails: [],
    methods: new Set<string>(),
    warnings: []
  };
}

function inferComponentName(filePath: string) {
  return path.basename(filePath, path.extname(filePath));
}

function sortValues(values: Iterable<string>) {
  return Array.from(values).sort((left, right) => left.localeCompare(right));
}

function sortDetailedValues(values: readonly string[], details: Map<string, string | undefined>): AnalysisDetailItem[] {
  return values
    .map((name) => ({
      name,
      type: details.get(name)
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function sortAnalysisDetailItems(values: readonly AnalysisDetailItem[]) {
  return [...values].sort((left, right) => {
    const nameOrder = left.name.localeCompare(right.name);
    if (nameOrder !== 0) {
      return nameOrder;
    }

    return (left.type || '').localeCompare(right.type || '');
  });
}

function toDetailItems(values: readonly string[]): AnalysisDetailItem[] {
  return values.map((name) => ({ name }));
}

function mergeSets<T>(...sets: Iterable<T>[]) {
  const result = new Set<T>();
  for (const set of sets) {
    for (const value of set) {
      result.add(value);
    }
  }
  return result;
}

function addAll<T>(target: Set<T>, values: Iterable<T>) {
  for (const value of values) {
    target.add(value);
  }
}

function mergeDetails(target: Map<string, string | undefined>, source: Map<string, string | undefined>) {
  for (const [name, type] of source) {
    const existingType = target.get(name);
    target.set(name, existingType ?? type);
  }
}

function stringifySfcError(error: Error | SyntaxError | string) {
  return typeof error === 'string' ? error : error.message;
}

function stringifyUnknownError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}