import { describe, expect, it } from 'vitest'
import tasksPageSource from '../../src/pages/TasksPage.vue?raw'

const mainCssSource = process
  .getBuiltinModule('fs')
  .readFileSync(new URL('../../src/assets/main.css', import.meta.url), 'utf-8')

describe('tasks page interactions', () => {
  it('opens task details from the task block while keeping row actions isolated', () => {
    expect(tasksPageSource).toContain('const selectedTaskId = ref<string | null>(null)')
    expect(tasksPageSource).toMatch(/const selectedTask = computed\([\s\S]*generationTasks\.value\.find\(\(task\) => task\.id === selectedTaskId\.value\)[\s\S]*\)/)
    expect(tasksPageSource).toContain('function isTaskRowControlTarget(event: Event)')
    expect(tasksPageSource).toContain('function openTaskDetailFromRow(event: MouseEvent, task: GenerationTask)')
    expect(tasksPageSource).toContain('function openTaskDetail(task: GenerationTask)')
    expect(tasksPageSource).toContain('function closeTaskDetail()')
    expect(tasksPageSource).toMatch(
      /<article\s+v-for="task in filteredGenerationTasks"[\s\S]*?@click="openTaskDetailFromRow\(\$event, task\)"/
    )
    expect(tasksPageSource).not.toContain('role="button"\n        tabindex="0"')
    expect(tasksPageSource).toContain("event.target.closest('button, input, label, select, textarea, a')")
    expect(tasksPageSource).toContain('@click.stop="openTaskDetail(task)"')
    expect(tasksPageSource).toContain('@click.stop="runTask(task)"')
    expect(tasksPageSource).toContain('@click.stop="cancelTask(task)"')
    expect(tasksPageSource).toContain('@click.stop="retryTask(task)"')
    expect(tasksPageSource).toContain('@click.stop="copyTaskPrompt(task)"')
    expect(tasksPageSource).toContain('<Teleport to="body">')
    expect(tasksPageSource).toContain('class="sam-modal-backdrop sam-task-detail-backdrop"')
    expect(tasksPageSource).toContain('@click.self="closeTaskDetail"')
    expect(tasksPageSource).toContain('@click.stop')
    expect(tasksPageSource).toContain('sam-task-detail-modal')
    expect(tasksPageSource).toContain('任务详情')
    expect(tasksPageSource).toContain('任务信息')
    expect(tasksPageSource).toContain('提示词')
    expect(tasksPageSource).toContain('负向提示词')
    expect(tasksPageSource).toContain('输出资产')
    expect(tasksPageSource).toContain('错误信息')
    expect(tasksPageSource).toContain("return '生成失败，错误详情已放在下方'")
    expect(tasksPageSource).not.toContain("return task.error || '生成失败，等待重试'")
    expect(tasksPageSource).toContain("task.priority == null ? '普通' : String(task.priority)")
    expect(tasksPageSource).toMatch(/async function retryTask\(task: GenerationTask\)[\s\S]*if \(selectedTaskId\.value === task\.id\)[\s\S]*closeTaskDetail\(\)/)
  })

  it('keeps task row action buttons readable in compact layouts', () => {
    expect(mainCssSource).toMatch(/\.sam-task-row-actions button\s*\{[^}]*flex:\s*0 0 auto;[^}]*min-width:\s*52px;[^}]*white-space:\s*nowrap;[^}]*\}/)
    expect(mainCssSource).toMatch(/\.sam-task-row-meta,\s*\n\.sam-task-row-output\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*max-height:\s*24px;[^}]*overflow:\s*hidden;[^}]*\}/)
    expect(mainCssSource).toMatch(/\.sam-task-row-output span\.error\s*\{[^}]*flex:\s*1 1 auto;[^}]*text-overflow:\s*ellipsis;[^}]*\}/)
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*640px\)\s*\{[\s\S]*\.sam-task-row-actions\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*flex-wrap:\s*wrap;[^}]*max-width:\s*none;[^}]*\}/
    )
  })

  it('keeps the task status summary compact enough for small desktop windows', () => {
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-tasks-summary\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-tasks-summary button\s*\{[^}]*min-height:\s*38px;[^}]*padding:\s*8px 10px;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*560px\)\s*\{[\s\S]*\.sam-tasks-summary\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[^}]*\}/
    )
  })

  it('keeps the task filters and rows from pushing the queue off compact windows', () => {
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-tasks-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(184px,\s*1\.25fr\) repeat\(3,\s*minmax\(104px,\s*1fr\)\);[^}]*\}/
    )
    expect(mainCssSource).toMatch(/\.sam-tasks-toolbar input\s*\{[^}]*grid-column:\s*auto;[^}]*\}/)
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-tasks-hero h1\s*\{[^}]*font-size:\s*22px;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-task-row-main p\s*\{[^}]*-webkit-line-clamp:\s*1;[^}]*\}/
    )
  })

  it('stacks the task page hero actions on narrow windows so the title is not squeezed', () => {
    expect(mainCssSource).toMatch(
      /\.sam-assets-hero h1,[\s\S]*\.sam-tasks-hero h1\s*\{[^}]*text-wrap:\s*balance;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*560px\)\s*\{[\s\S]*\.sam-tasks-hero,\s*\n\s*\.sam-prompts-syncbar,\s*\n\s*\.sam-assets-bulkbar\s*\{[^}]*align-items:\s*flex-start;[^}]*flex-direction:\s*column;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*560px\)\s*\{[\s\S]*\.sam-tasks-hero > div:first-child,\s*\n\s*\.sam-tasks-hero > div:last-of-type\s*\{[^}]*width:\s*100%;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*560px\)\s*\{[\s\S]*\.sam-tasks-hero button\s*\{[^}]*flex:\s*1 1 130px;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*560px\)\s*\{[\s\S]*\.sam-tasks-hero h1\s*\{[^}]*word-break:\s*keep-all;[^}]*\}/
    )
  })
})
