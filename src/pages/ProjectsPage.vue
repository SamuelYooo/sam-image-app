<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useAssetStore } from '../stores/assetStore'
import { useStoryboardStore, type StoryboardProject } from '../stores/storyboardStore'
import { formatBeijingDateTime } from '../utils/time'

const storyboardStore = useStoryboardStore()
const assetStore = useAssetStore()
const { storyboardProjects, currentDraft, isLoadingProjects, isExportingPdf, lastStoryboardError } =
  storeToRefs(storyboardStore)
const pageMessage = ref('')

const projectCount = computed(() => storyboardProjects.value.length)

onMounted(() => {
  void storyboardStore.loadStoryboardProjects()
})

function formatProjectTime(project: StoryboardProject) {
  return formatBeijingDateTime(project.updatedAt)
}

function getProjectShotCount(project: StoryboardProject) {
  const shotCount = project.settings.shotCount
  return typeof shotCount === 'number' ? shotCount : undefined
}

async function openProject(project: StoryboardProject) {
  const draft = await storyboardStore.openStoryboardProject(project.id)
  if (draft) {
    pageMessage.value = '已打开分镜项目'
  }
}

async function exportProjectPdf(project: StoryboardProject) {
  const draft = currentDraft.value?.project.id === project.id ? currentDraft.value : await storyboardStore.openStoryboardProject(project.id)
  if (!draft) {
    return
  }
  const asset = await storyboardStore.exportStoryboardPdf(project.id)
  if (asset) {
    pageMessage.value = '已导出 PDF 分镜稿并写入资产库'
    await assetStore.loadAssets()
  }
}
</script>

<template>
  <section class="sam-projects-page">
    <header class="sam-projects-hero">
      <div>
        <span class="sam-eyebrow">项目</span>
        <h1>分镜项目管理</h1>
        <p>集中查看故事草案、角色、场景、镜头项目，并可重新打开或导出 PDF 分镜稿。</p>
      </div>
      <button type="button" :disabled="isLoadingProjects" @click="storyboardStore.loadStoryboardProjects">
        <span class="i-mdi-refresh" aria-hidden="true" />
        {{ isLoadingProjects ? '刷新中' : '刷新项目' }}
      </button>
    </header>

    <section class="sam-projects-summary">
      <span>{{ projectCount }} 个分镜项目</span>
      <span v-if="currentDraft">当前打开：{{ currentDraft.project.name }}</span>
      <span v-else>当前未打开项目</span>
    </section>

    <p v-if="pageMessage" class="sam-workspace-message projects-page">{{ pageMessage }}</p>
    <p v-if="lastStoryboardError" class="sam-config-error projects-page">{{ lastStoryboardError }}</p>

    <section v-if="storyboardProjects.length" class="sam-projects-grid">
      <article
        v-for="project in storyboardProjects"
        :key="project.id"
        class="sam-project-card"
        :class="{ active: currentDraft?.project.id === project.id }"
      >
        <header>
          <span class="i-mdi-filmstrip-box-multiple" aria-hidden="true" />
          <div>
            <strong>{{ project.name }}</strong>
            <small>{{ formatProjectTime(project) }}</small>
          </div>
          <em>{{ project.status }}</em>
        </header>
        <p>{{ project.description || '无项目描述' }}</p>
        <div class="sam-project-meta">
          <span>{{ getProjectShotCount(project) || '未记录' }} 镜头</span>
          <span>{{ project.projectType }}</span>
          <span>{{ project.id }}</span>
        </div>
        <footer>
          <button type="button" @click="openProject(project)">打开</button>
          <button type="button" :disabled="isExportingPdf" @click="exportProjectPdf(project)">
            {{ isExportingPdf ? '导出中' : '导出 PDF' }}
          </button>
        </footer>
      </article>
    </section>

    <section v-else class="sam-projects-empty">
      <span class="i-mdi-folder-open-outline" aria-hidden="true" />
      <p>还没有分镜项目。可以在工作台输入故事概念后一键生成完整草案。</p>
    </section>
  </section>
</template>
