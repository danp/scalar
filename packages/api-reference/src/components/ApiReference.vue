<script setup lang="ts">
import { useApiClientStore } from '@scalar/api-client'
import { type ThemeId, ThemeStyles } from '@scalar/themes'
import { FlowToastContainer } from '@scalar/use-toasts'
import { useMediaQuery, useResizeObserver } from '@vueuse/core'
import {
  computed,
  defineAsyncComponent,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'

import { getTagSectionId } from '../helpers'
import { useTemplateStore } from '../stores/template'
import type { ReferenceProps, Spec } from '../types'
import { default as ApiClientModal } from './ApiClientModal.vue'
import { Content } from './Content'
import MobileHeader from './MobileHeader.vue'
import SearchModal from './SearchModal.vue'
import Sidebar from './Sidebar.vue'

const props = withDefaults(defineProps<ReferenceProps>(), {
  showSidebar: true,
  isEditable: false,
  theme: 'default',
})

defineEmits<{
  (e: 'changeTheme', value: ThemeId): void
}>()

/**
 * The editor component has heavy dependencies (process), let's lazy load it.
 */
const LazyLoadedSwaggerEditor = defineAsyncComponent(() =>
  import('@scalar/swagger-editor').then((module) => module.SwaggerEditor),
)

const specRef = ref<string>(props.spec ?? '')

watch(
  () => props.spec,
  () => {
    if (props.spec) {
      specRef.value = props.spec
    }
  },
  { immediate: true },
)

const fetchSpecUrl = () => {
  if (props.specUrl === undefined || props.specUrl.length === 0) {
    return
  }

  fetch(props.specUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error('The provided OpenAPI/Swagger spec URL is invalid.')
      }

      return response.text()
    })
    .then((data) => {
      specRef.value = data
    })
    .catch((error) => {
      console.log(
        'Could not fetch the OpenAPI/Swagger Spec file:',
        error.message,
      )
    })
}

const isLargeScreen = useMediaQuery('(min-width: 1150px)')
const isMobile = useMediaQuery('(max-width: 1000px)')

// Track the container height to control the sidebar height
const elementHeight = ref(0)
const documentEl = ref<HTMLElement | null>(null)
useResizeObserver(documentEl, (entries) => {
  elementHeight.value = entries[0].contentRect.height
})

const { toggleCollapsedSidebarItem } = useTemplateStore()
const { state, setActiveSidebar } = useApiClientStore()

const showMobileDrawer = computed(() => {
  const { state: s } = useTemplateStore()
  return s.showMobileDrawer
})

// Handle content updates
const transformedSpec = reactive<Spec>({
  info: {
    title: '',
    description: '',
    termsOfService: '',
    version: '',
    license: {
      name: '',
      url: '',
    },
    contact: {
      email: '',
    },
  },
  externalDocs: {
    description: '',
    url: '',
  },
  servers: [],
  tags: [],
})

// TODO: proper types
const handleSpecUpdate = (newSpec: any) => {
  Object.assign(transformedSpec, {
    // Some specs don’t have servers or tags, make sure they are defined
    servers: [],
    tags: [],
    ...newSpec,
  })

  if (!state.activeSidebar) {
    const firstTag = transformedSpec.tags[0]

    if (firstTag) {
      toggleCollapsedSidebarItem(getTagSectionId(firstTag))
    }

    const firstOperation = transformedSpec.tags[0]?.operations?.[0]

    if (firstOperation) {
      const { httpVerb, operationId } = firstOperation
      setActiveSidebar(`${httpVerb}-${operationId}`)
    }
  }
}

watch(
  () => props.specResult,
  (newSpec) => {
    if (newSpec) {
      handleSpecUpdate(newSpec)
    }
  },
  { immediate: true },
)

onMounted(() => {
  document.querySelector('#tippy')?.scrollTo({
    top: 0,
    left: 0,
  })

  fetchSpecUrl()
})

const showAside = computed(() => isLargeScreen.value || !props.isEditable)

const showCodeEditor = computed(() => {
  return !props.specResult && props.isEditable
})

// Navigational breadcrumb text from reference info
const breadCrumbs = computed(() => {
  const operations = transformedSpec.tags
    .map((t) => (t.operations || []).flatMap((o) => ({ ...o, tag: t.name })))
    .flat()

  const op = operations.find((o) => {
    return `${o.httpVerb}-${o.operationId}` === state.activeSidebar
  })

  console.log(op, operations, state.activeSidebar)

  return op ? `${op.tag.toUpperCase()} / ${op.name}` : ''
})
</script>
<template>
  <ThemeStyles :id="theme" />
  <FlowToastContainer />
  <div
    ref="documentEl"
    :class="[
      'scalar-api-reference',
      'document',
      'layout-swagger-editor',
      { 'footer-below-sidebar': footerBelowSidebar, 'preview': !isEditable },
    ]"
    :style="{ '--full-height': `${elementHeight}px` }">
    <slot name="search-modal">
      <SearchModal
        :spec="transformedSpec"
        variant="search" />
    </slot>
    <!-- Desktop header -->
    <div
      v-if="!isMobile"
      class="layout-header">
      <slot name="header"></slot>
    </div>
    <!-- Sidebar wrapper -->
    <aside class="layout-aside-left t-doc__sidebar">
      <!-- Mobile header content -->
      <slot
        v-if="isMobile"
        :label="breadCrumbs"
        name="mobile-header">
        <!-- Fallback mobile header -->
        <MobileHeader>
          {{ breadCrumbs }}
        </MobileHeader>
      </slot>
      <!-- Primary sidebar content -->
      <!-- Sorry for the terrible v-if - this is so we only manage the menu state if theres no external mobile header being injected to manage it otherwise -->
      <div
        v-if="
          isMobile && !$slots['mobile-header']
            ? showSidebar && showMobileDrawer
            : showSidebar
        "
        class="layout-aside-content">
        <slot
          v-if="isMobile"
          name="header" />
        <Sidebar :spec="transformedSpec" />
      </div>
    </aside>
    <!-- Swagger file editing -->
    <div
      v-show="showCodeEditor"
      class="layout-content">
      <LazyLoadedSwaggerEditor
        :hocuspocusConfiguration="hocuspocusConfiguration"
        :initialTabState="initialTabState"
        :proxyUrl="proxyUrl"
        :theme="theme"
        :value="specRef"
        @changeTheme="$emit('changeTheme', $event)"
        @specUpdate="handleSpecUpdate" />
    </div>
    <!-- Rendered reference -->
    <div
      v-if="showAside"
      class="layout-aside-right">
      <Content
        :ready="true"
        :spec="transformedSpec" />
    </div>
    <slot name="footer"></slot>
    <!-- REST API Client Overlay -->
    <ApiClientModal
      :proxyUrl="proxyUrl"
      :spec="transformedSpec" />
  </div>
</template>

<style lang="postcss">
/** CSS Reset */
.scalar-api-reference,
#headlessui-portal-root {
  p {
    margin: 0;
  }

  i {
    font-style: normal;
  }

  ul,
  ol {
    margin: 0;
    padding: 0;
  }

  /** Add some more things which are normally applied to `html`. */
  font-family: var(--theme-font, var(--default-theme-font));
  line-height: 1.15;
  -webkit-text-size-adjust: 100%;
  -moz-tab-size: 4;
  tab-size: 4;

  /** Make sure box-sizing is set properly. */
  box-sizing: border-box;

  *,
  *:before,
  *:after {
    box-sizing: inherit;
  }

  /** Smooth text rendering */
  * {
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  input::placeholder {
    color: var(--theme-color-3, var(--default-theme-color-3));
    font-family: var(--theme-font, var(--default-theme-font));
    color: var(--theme-color-3, var(--default-theme-color-3));
  }
  input:-ms-input-placeholder {
    color: var(--theme-color-3, var(--default-theme-color-3));
    font-family: var(--theme-font, var(--default-theme-font));
    color: var(--theme-color-3, var(--default-theme-color-3));
  }
  input::-webkit-input-placeholder {
    color: var(--theme-color-3, var(--default-theme-color-3));
    font-family: var(--theme-font, var(--default-theme-font));
    color: var(--theme-color-3, var(--default-theme-color-3));
  }
}

/* ?? layout stuff */
:root {
  --default-scalar-api-reference-theme-header-height: 0px;
  --default-scalar-api-reference-theme-sidebar-width: 250px;
  --default-scalar-api-reference-theme-toc-width: 300px;
  --default-scalar-api-reference-app-header-height: 100px;
  --default-scalar-api-reference-col-width-1: 250px;
  --default-scalar-api-reference-col-width-2: calc(50% - 125px);
  --default-scalar-api-reference-col-width-3: calc(50% - 125px);
  --default-scalar-api-reference-full-height: 100%;
}

@media (max-width: 1000px) {
  :root {
    --default-scalar-api-reference-theme-header-height: 50px;
  }
}

/** Utilities, how do we deal with them? */
.flex {
  display: flex;
}

.flex-col {
  display: flex;
  min-height: 0;
  flex-direction: column;
}
.flex-mobile {
  display: flex;
  min-width: 0;
}

@media (max-width: 500px) {
  .flex-mobile {
    flex-direction: column;
  }
}
.gap-1 {
  gap: 12px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

/** TODO: Move to components */
.codemenu-topbar {
  background: var(--theme-background-2, var(--default-theme-background-2));
  border-bottom: 1px solid
    var(--theme-border-color, var(--default-theme-border-color));
  padding: 0 7px 0 12px;
  border-radius: var(--theme-radius, var(--default-theme-radius))
    var(--theme-radius, var(--default-theme-radius)) 0 0;
}
.codemenu {
  display: flex;
  position: relative;
  justify-content: space-between;
  align-items: center;
  min-height: 35px;
}
.codemenu-tabs {
  display: flex;
  position: relative;
  column-gap: 6px;
}
.codemenu-item {
  position: relative;
  display: flex;
  align-items: center;
}
.codemenu-item-key {
  font-size: var(--theme-micro, var(--default-theme-micro));
  color: var(--theme-color-3, var(--default-theme-color-3));
  padding: 6px 4px;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: var(--theme-semibold, var(--default-theme-semibold));
  position: relative;
  margin-left: -4px;
  margin-right: -4px;
  border-radius: var(--theme-radius-lg, var(--default-theme-radius-lg));
  text-transform: uppercase;
}
.codemenu-item-key:hover {
  background: var(
    --scalar-api-reference-theme-background-3,
    var(--default-scalar-api-reference-theme-background-3)
  );
}
.codemenu-item:first-of-type:last-of-type .codemenu-item-key,
.codemenu-item__active .codemenu-item-key {
  color: var(--theme-color-1, var(--default-theme-color-1));
}
.codemenu-item:first-of-type:last-of-type:after,
.codemenu-item__active:after {
  content: '';
  width: 100%;
  height: 1px;
  position: absolute;
  bottom: -4px;
  background: var(--theme-color-1, var(--default-theme-color-1));
}

.codemenu-item__disabled {
  pointer-events: none;
}
.endpoint {
  display: flex;
  white-space: nowrap;
  cursor: pointer;
}
.endpoint span:first-of-type {
  text-transform: uppercase;
}

.codemenu .endpoint {
  overflow: hidden;
}
.endpoint .post {
  color: var(--theme-color-green, var(--default-theme-color-green));
}
.endpoint .patch {
  color: var(--theme-color-yellow, var(--default-theme-color-yellow));
}
.endpoint .get {
  color: var(--theme-color-blue, var(--default-theme-color-blue));
}
.endpoint .delete {
  color: var(--theme-color-red, var(--default-theme-color-red));
}
.endpoint .put {
  color: var(--theme-color-orange, var(--default-theme-color-orange));
}
.endpoint .post,
.endpoint .get,
.endpoint .delete,
.endpoint .put {
  white-space: nowrap;
}
.endpoint span {
  color: var(--theme-color-1, var(--default-theme-color-1));
  min-width: 62px;
  display: inline-block;
  text-align: right;
  line-height: 1.55;
  font-family: var(--theme-font-code, var(--default-theme-font-code));
  font-size: var(--theme-small, var(--default-theme-small));
  cursor: pointer;
}
.languages .example-item-endpoints {
  background: var(--theme-background-2, var(--default-theme-background-2));
  width: 100%;
  border-top: 1px solid
    var(--theme-border-color, var(--default-theme-border-color));
}
.endpoint-response p {
  margin-top: 6px;
  font-size: var(--theme-small, var(--default-theme-small));
  min-height: auto;
  line-height: 17px;
}

.codemenu .endpoint span {
  text-align: left;
  min-width: auto;
}
.endpoint-response {
  border-top: 1px solid
    var(--theme-border-color, var(--default-theme-border-color));
  padding: 12px 0;
  font-size: var(--theme-small, var(--default-theme-small));
}

.tag-description {
  margin-top: 12px;
}

.reference .endpoint-title {
  display: flex;
  margin-bottom: 12px;
  margin-top: 24px;
}
.copy .title {
  font-size: var(--theme-heading-4, var(--default-theme-heading-4));
  font-weight: var(--theme-semibold, var(--default-theme-semibold));
  color: var(--theme-color-1, var(--default-theme-color-1));
  line-height: 1.45;
  margin: 0;
}
.endpoint-response__headers {
  padding-bottom: 0;
}
.endpoint-response__headers + .endpoint-response {
  border-top: none;
}

/* ----------------------------------------------------- */

.reference {
  position: relative;
  padding: 0 60px;
  width: 100%;
}

.reference:not(:last-of-type) {
  border-bottom: 1px solid
    var(--theme-border-color, var(--default-theme-border-color));
}

.reference .reference-container {
  position: relative;
  display: flex;
  gap: 48px;

  max-width: 1120px;
  margin: auto;
  padding: 90px 0;
}

.reference-container + .reference-container {
  border-top: 1px solid
    var(--theme-border-color, var(--default-theme-border-color));
}

.reference-container .copy,
.reference-container .example {
  flex: 1;
  min-width: 0;
}

.response .cm-editor {
  max-height: calc(50vh - 90px);
}

.example {
  padding-top: 48px;
  top: 12px;
  height: fit-content;
  position: sticky;
  max-height: calc(100vh - 96px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.copy .tag-description a {
  color: var(--theme-color-1, var(--default-theme-color-1));
  text-decoration: underline;
}
.copy ul {
  color: var(--theme-color-1, var(--default-theme-color-1));
}
/* ----------------------------------------------------- */
/* Responsive styles for narrow reference container (900px) */
.references-narrow {
  min-height: 100vh;
}
.references-narrow .reference {
  padding: 0 30px;
}
@media screen and (max-width: 1000px) {
  .references-narrow .reference {
    padding: 0 24px;
  }
}
.references-narrow .reference-container {
  flex-direction: column;
  gap: 24px;
  padding: 50px 0;
}

.references-narrow .example {
  padding-top: 0;
}

.editor-heading h1 {
  font-size: var(
    --font-size,
    var(
      --default-font-size,
      var(--theme-heading-2, var(--default-theme-heading-2))
    )
  );
  font-weight: var(
    --font-weight,
    var(--default-font-weight, var(--theme-bold, var(--default-theme-bold)))
  );
  /* prettier-ignore */
  color: var(--theme-color-1, var(--default-theme-color-1));
  word-wrap: break-word;
  line-height: 1.45;
  margin-top: 0;
}

/** Layout */
/* ----------------------------------------------------- */
/* Document Layouts */

.document {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;

  background-color: var(
    --theme-background-1,
    var(--default-theme-background-1)
  );

  /* Fallback to 100vh if the element height is not specified */
  --default-full-height: var(
    --scalar-api-reference-full-height,
    var(--default-scalar-api-reference-full-height, 100vh)
  );

  --default-document-height: calc(
    var(
        --scalar-api-reference-full-height,
        var(--default-scalar-api-reference-full-height)
      ) -
      var(
        --scalar-api-reference-theme-header-height,
        var(--default-scalar-api-reference-theme-header-height)
      )
  );

  --default-scalar-api-reference-col-width-1: var(
    --scalar-api-reference-theme-sidebar-width,
    var(--default-scalar-api-reference-theme-sidebar-width)
  );
  --default-scalar-api-reference-col-width-2: auto;
  --default-scalar-api-reference-col-width-3: var(
    --scalar-api-reference-theme-toc-width,
    var(--default-scalar-api-reference-theme-toc-width)
  );
  --scalar-api-reference-theme-header-height: var(
    --theme-header-height,
    var(--default-scalar-api-reference-theme-header-height)
  );

  display: grid;

  grid-template-rows:
    var(
      --scalar-api-reference-theme-header-height,
      var(--default-scalar-api-reference-theme-header-height)
    )
    auto
    auto;

  grid-template-columns:
    var(
      --scalar-api-reference-col-width-1,
      var(--default-scalar-api-reference-col-width-1)
    )
    var(
      --scalar-api-reference-col-width-2,
      var(--default-scalar-api-reference-col-width-2)
    )
    var(
      --scalar-api-reference-col-width-3,
      var(--default-scalar-api-reference-col-width-3)
    );

  grid-template-areas:
    'header header header'
    'sidebar content aside'
    'sidebar footer footer';
}

.document.hide-aside-left {
  --default-scalar-api-reference-col-width-1: 0;
}

.document.hide-aside-right {
  --default-scalar-api-reference-col-width-3: 0;
}
.document.hide-aside-left .layout-aside-left .layout-aside-content,
.document.hide-aside-right .layout-aside-right .layout-aside-content {
  border-right-color: transparent;
  border-left-color: transparent;
  display: none;
}

.document.footer-below-sidebar {
  grid-template-areas:
    'header header header'
    'sidebar content aside'
    'footer footer footer';
}

.layout-header {
  grid-area: header;
  position: sticky;
  top: 0;
  z-index: 10;
}

.layout-content {
  grid-area: content;
  min-width: 0;
  background: var(--theme-background-1, var(--default-theme-background-1));
  display: flex;
}
/* add extra padding to top of edit made to match the getting started module */
.layout-content
  ~ .layout-aside-right
  .references-narrow
  .reference:first-of-type
  .reference-container {
  padding-top: 75px;
}
/* Measures the visible viewport of the editor */
.layout-content-viewport {
  position: fixed;
  left: var(
    --scalar-api-reference-theme-sidebar-width,
    var(--default-scalar-api-reference-theme-sidebar-width)
  );
  right: var(
    --scalar-api-reference-theme-toc-width,
    var(--default-scalar-api-reference-theme-toc-width)
  );
  top: calc(
    var(
        --scalar-api-reference-app-header-height,
        var(--default-scalar-api-reference-app-header-height)
      ) +
      var(
        --scalar-api-reference-theme-header-height,
        var(--default-scalar-api-reference-theme-header-height)
      )
  );
  bottom: 0;
  pointer-events: none;
}

.layout-aside-left {
  position: relative;
  grid-area: sidebar;
  position: sticky;
  top: var(
    --scalar-api-reference-theme-header-height,
    var(--default-scalar-api-reference-theme-header-height)
  );
  height: calc(
    var(--full-height) - var(--scalar-api-reference-theme-header-height)
  );
}

.layout-aside-right {
  position: relative;
  grid-area: aside;
  background: var(--theme-background-1, var(--default-theme-background-1));
}

.layout-aside-content {
  /* position: sticky; */
  /* top: var(
    --scalar-api-reference-theme-header-height,
    var(--default-scalar-api-reference-theme-header-height)
  ); */
  /* height: calc(var(--full-height) - var(--scalar-api-reference-theme-header-height)); */
  height: 100%;
  background: var(
    --sidebar-background-1,
    var(
      --default-sidebar-background-1,
      var(--theme-background-1, var(--default-theme-background-1))
    )
  );
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.layout-footer {
  grid-area: footer;
}

/* ----------------------------------------------------- */
/* Document layout modified for references */

.document.layout-swagger-editor {
  /* Fallback to 100vh if the element height is not specified */
  --default-full-height: var(
    --scalar-api-reference-full-height,
    var(--default-scalar-api-reference-full-height),
    100vh
  );
  /* --scalar-api-reference-theme-header-height: 50px; */
  /* --scalar-api-reference-theme-sidebar-width: 200px; */
  /* --theme-toc-width: 200px; */
  max-height: 100vh;
  --default-document-height: calc(
    var(
        --scalar-api-reference-full-height,
        var(--default-scalar-api-reference-full-height)
      ) -
      var(
        --scalar-api-reference-theme-header-height,
        var(--default-scalar-api-reference-theme-header-height)
      )
  );

  --default-scalar-api-reference-col-width-1: var(
    --scalar-api-reference-theme-sidebar-width,
    var(--default-scalar-api-reference-theme-sidebar-width)
  );
  --default-scalar-api-reference-col-width-2: calc(
    50% -
      (
        var(
            --scalar-api-reference-theme-sidebar-width,
            var(--default-scalar-api-reference-theme-sidebar-width)
          ) / 2
      )
  );
  --default-scalar-api-reference-col-width-3: calc(
    50% -
      (
        var(
            --scalar-api-reference-theme-sidebar-width,
            var(--default-scalar-api-reference-theme-sidebar-width)
          ) / 2
      )
  );

  display: grid;

  grid-template-rows:
    var(
      --scalar-api-reference-theme-header-height,
      var(--default-scalar-api-reference-theme-header-height)
    )
    auto;

  grid-template-columns:
    var(
      --scalar-api-reference-col-width-1,
      var(--default-scalar-api-reference-col-width-1)
    )
    var(
      --scalar-api-reference-col-width-2,
      var(--default-scalar-api-reference-col-width-2)
    )
    var(
      --scalar-api-reference-col-width-3,
      var(--default-scalar-api-reference-col-width-3)
    );

  grid-template-areas:
    'header header header'
    'sidebar content aside'
    'sidebar content footer';
}

.document.layout-swagger-editor .layout-content {
  position: sticky;
  top: var(
    --scalar-api-reference-theme-header-height,
    var(--default-scalar-api-reference-theme-header-height)
  );
  height: calc(
    var(--full-height) - var(--scalar-api-reference-theme-header-height)
  );
}

.document.preview {
  --default-scalar-api-reference-col-width-2: calc(
    100% -
      (
        var(
          --scalar-api-reference-theme-sidebar-width,
          var(--default-scalar-api-reference-theme-sidebar-width)
        )
      )
  );
  --default-scalar-api-reference-col-width-3: calc(
    100% -
      (
        var(
          --scalar-api-reference-theme-sidebar-width,
          var(--default-scalar-api-reference-theme-sidebar-width)
        )
      )
  );

  grid-template-areas:
    'header header'
    'sidebar aside'
    'sidebar footer';
}

.document.layout-swagger-editor.footer-below-sidebar.preview {
  grid-template-areas:
    'header header'
    'sidebar aside'
    'footer footer';
}

.document.layout-swagger-editor.hide-aside-left {
  --default-scalar-api-reference-col-width-1: 0;
  --default-scalar-api-reference-col-width-2: 50%;
  --default-scalar-api-reference-col-width-3: 50%;
}

/* ----------------------------------------------------- */
/* Responsive styles */

@media (max-width: 1150px) {
  .document.layout-swagger-editor {
    --default-scalar-api-reference-col-width-3: 0;
    --default-scalar-api-reference-col-width-2: auto;
  }
}

@media (max-width: 1000px) {
  .document,
  .document.layout-swagger-editor {
    /** Content area heights are restricted using just the template row defs */
    display: block;
  }

  .layout-aside-left,
  .layout-aside-right,
  .layout-aside-content {
    position: static;
    max-height: unset;
  }

  .layout-aside-left {
    position: sticky;
    top: 0;
    height: var(
      --scalar-api-reference-theme-header-height,
      var(--default-scalar-api-reference-theme-header-height)
    );

    width: 100%;
    z-index: 10;
    border-right: none;
  }

  .layout-aside-left .layout-aside-content {
    position: absolute;

    /* Offset by 1px to avoid gap */
    top: calc(100% - 1px);
    left: 0;
    width: 100%;

    /* Offset by 2px to fill screen and compensate for gap */
    height: calc(
      var(--full-height, 100vh) -
        var(--scalar-api-reference-theme-header-height) + 2px
    );

    border-top: 1px solid
      var(--theme-border-color, var(--default-theme-border-color));
    display: flex;
    flex-direction: column;
  }
}
</style>
