<template>
  <div class="shell">
    <section class="diagram">
      <article class="panel diagram-col">
        <div class="network">
          <div class="diagram-header-copy">
            <div class="eyebrow">Component</div>
            <p class="diagram-path">{{ payload.componentPath }}</p>
          </div>

          <BadgeCard :asset-uri="payload.badgeAssetUri" :label="payload.badgeLabel" />

          <ConnectorSvg />

          <ClusterSection
            title="Router"
            node-key="external-source-router"
            node-class="external-source-router"
            :total="routerTotal"
            :sections="[{ ...sections.router, label: 'Router', detailId: 'router' }]"
            @open-detail="openDetail"
          />

          <ClusterSection
            title="Injected"
            node-key="external-source"
            node-class="external-source"
            :total="injectTotal"
            :sections="[{ ...sections.injects, label: 'Injected', detailId: 'injects' }]"
            @open-detail="openDetail"
          />

          <ClusterSection
            title="Stores"
            node-key="external-source-store"
            node-class="external-source-store"
            :total="storeTotal"
            :sections="[{ ...sections.stores, label: 'Stores', detailId: 'stores' }]"
            @open-detail="openDetail"
          />

          <ClusterSection
            title="Inputs"
            node-key="inputs"
            node-class="inputs"
            :total="inputTotal"
            :sections="[
              { ...sections.props, label: 'Props', detailId: 'props' },
              { ...sections.models, label: 'V-Model', detailId: 'models' },
              { ...sections.slots, label: 'Slots', detailId: 'slots' },
            ]"
            @open-detail="openDetail"
          />

          <ComponentNode
            :name="payload.componentName"
            :internal-total="internalTotal"
            :sections="[
              { ...sections.refs, label: 'Ref', detailId: 'refs' },
              { ...sections.computed, label: 'Computed', detailId: 'computed' },
              { ...sections.watchers, label: 'Watch', detailId: 'watchers' },
            ]"
            @open-detail="openDetail"
          />

          <ClusterSection
            title="Outputs"
            node-key="outputs"
            node-class="outputs"
            :total="outputTotal"
            :sections="[
              { ...sections.emits, label: 'Emit', detailId: 'emits' },
              { ...sections.exposed, label: 'Exposed', detailId: 'exposed' },
              { ...sections.slotProps, label: 'Slot Props', detailId: 'slotProps' },
            ]"
            @open-detail="openDetail"
          />

          <ClusterSection
            title="Provided"
            node-key="external-source-provide"
            node-class="external-source-provide"
            :total="provideTotal"
            :sections="[{ ...sections.provides, label: 'Provided', detailId: 'provides' }]"
            @open-detail="openDetail"
          />
        </div>
      </article>
    </section>
  </div>

  <DetailDialog ref="dialogRef" :section="activeSection" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import BadgeCard from './components/BadgeCard.vue';
import ClusterSection from './components/ClusterSection.vue';
import ComponentNode from './components/ComponentNode.vue';
import ConnectorSvg from './components/ConnectorSvg.vue';
import DetailDialog from './components/DetailDialog.vue';
import type { ComplexityPayload, DetailSection } from './types';

const FALLBACK_PAYLOAD: ComplexityPayload = {
  componentName: '',
  componentPath: '',
  badgeAssetUri: '',
  badgeLabel: 'empty',
  sections: {},
};

const payload = ref<ComplexityPayload>(FALLBACK_PAYLOAD);
const dialogRef = ref<InstanceType<typeof DetailDialog> | null>(null);
const activeDetailId = ref<string | null>(null);

const sections = computed(() => payload.value.sections as Record<string, DetailSection>);

const inputTotal = computed(() =>
  (sections.value.props?.items.length ?? 0)
  + (sections.value.models?.items.length ?? 0)
  + (sections.value.slots?.items.length ?? 0)
);
const injectTotal = computed(() => sections.value.injects?.items.length ?? 0);
const storeTotal = computed(() => sections.value.stores?.items.length ?? 0);
const routerTotal = computed(() => sections.value.router?.items.length ?? 0);
const provideTotal = computed(() => sections.value.provides?.items.length ?? 0);
const outputTotal = computed(() =>
  (sections.value.emits?.items.length ?? 0)
  + (sections.value.exposed?.items.length ?? 0)
  + (sections.value.slotProps?.items.length ?? 0)
);
const internalTotal = computed(() =>
  (sections.value.refs?.items.length ?? 0)
  + (sections.value.computed?.items.length ?? 0)
  + (sections.value.watchers?.items.length ?? 0)
);

const activeSection = computed(() =>
  activeDetailId.value ? (sections.value[activeDetailId.value] ?? null) : null
);

function openDetail(detailId: string) {
  const section = sections.value[detailId];
  if (!section || section.items.length === 0) return;
  activeDetailId.value = detailId;
  dialogRef.value?.open();
}

onMounted(() => {
  const el = document.getElementById('analysis-details');
  if (!el) return;
  try {
    payload.value = JSON.parse(el.textContent ?? '{}') as ComplexityPayload;
  } catch {
    // keep fallback
  }
});
</script>
