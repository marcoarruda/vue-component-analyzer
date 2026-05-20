<template>
  <svg ref="svgEl" class="connector" aria-hidden="true">
    <defs>
      <marker id="connector-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" />
      </marker>
    </defs>
    <line v-for="conn in connections" :key="conn.from + '-' + conn.to"
      :data-from="conn.from"
      :data-to="conn.to"
      :stroke="conn.stroke"
      x1="0" y1="0" x2="0" y2="0"
    />
  </svg>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const svgEl = ref<SVGSVGElement | null>(null);

const connections = [
  { from: 'inputs', to: 'component', stroke: 'var(--inputs)' },
  { from: 'external-source', to: 'component', stroke: 'var(--external-sources)' },
  { from: 'external-source-store', to: 'component', stroke: 'var(--external-sources-alt)' },
  { from: 'external-source-router', to: 'component', stroke: 'var(--router)' },
  { from: 'component', to: 'outputs', stroke: 'var(--outputs)' },
  { from: 'component', to: 'external-source-provide', stroke: 'var(--external-sources)' },
];

function anchorPoint(rect: DOMRect, targetRect: DOMRect) {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const deltaX = targetCenterX - centerX;
  const deltaY = targetCenterY - centerY;

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return { x: deltaX >= 0 ? rect.right : rect.left, y: centerY };
  }
  return { x: centerX, y: deltaY >= 0 ? rect.bottom : rect.top };
}

function connectorPoints(fromKey: string, toKey: string, fromRect: DOMRect, toRect: DOMRect) {
  if (toKey === 'component' && (fromKey === 'external-source' || fromKey === 'external-source-store')) {
    const centerX = fromRect.left + fromRect.width / 2;
    return { start: { x: centerX, y: fromRect.bottom }, end: { x: centerX, y: toRect.top } };
  }
  if (fromKey === 'external-source-router' && toKey === 'component') {
    return { start: { x: fromRect.right, y: fromRect.bottom }, end: { x: toRect.left, y: toRect.top } };
  }
  return { start: anchorPoint(fromRect, toRect), end: anchorPoint(toRect, fromRect) };
}

function renderConnectors() {
  const svg = svgEl.value;
  const network = svg?.closest('.network');
  if (!svg || !network || window.innerWidth <= 980) return;

  const networkRect = network.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${networkRect.width} ${networkRect.height}`);

  for (const line of svg.querySelectorAll<SVGLineElement>('line')) {
    const fromKey = line.getAttribute('data-from')!;
    const toKey = line.getAttribute('data-to')!;
    const fromEl = network.querySelector(`[data-node="${fromKey}"]`);
    const toEl = network.querySelector(`[data-node="${toKey}"]`);
    if (!fromEl || !toEl) continue;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const { start, end } = connectorPoints(fromKey, toKey, fromRect, toRect);

    line.setAttribute('x1', String(start.x - networkRect.left));
    line.setAttribute('y1', String(start.y - networkRect.top));
    line.setAttribute('x2', String(end.x - networkRect.left));
    line.setAttribute('y2', String(end.y - networkRect.top));
  }
}

let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
  renderConnectors();
  window.addEventListener('resize', renderConnectors);
  window.addEventListener('load', renderConnectors);

  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(renderConnectors);
    resizeObserver.observe(document.body);
    const network = svgEl.value?.closest('.network');
    if (network) resizeObserver.observe(network);
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', renderConnectors);
  window.removeEventListener('load', renderConnectors);
  resizeObserver?.disconnect();
});
</script>
