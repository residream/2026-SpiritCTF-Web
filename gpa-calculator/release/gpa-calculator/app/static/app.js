const $ = (s, root = document) => root.querySelector(s)

/* ---------- toast ---------- */
let toastTimer
function toast(message) {
  const box = $('#toast')
  box.textContent = message
  box.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (box.hidden = true), 3200)
}

/* ---------- course table ---------- */
const SAMPLE = [
  { name: '程序设计基础', credits: 4, score: '89.9' },
  { name: '微积分AⅠ', credits: 3.5, score: '83.9' },
  { name: '线性代数A', credits: 2.5, score: '86.9' }
]
const body = $('#courseBody')

function makeRow(course = {}) {
  const tr = document.createElement('tr')
  tr.innerHTML = `
    <td><input type="text" class="c-name" placeholder="课程名称" /></td>
    <td class="col-credits"><input type="number" class="c-credits" min="0" max="20" step="0.5" placeholder="学分" /></td>
    <td class="col-score"><input type="text" class="c-score" placeholder="分数/等级" /></td>
    <td class="col-point"><output class="c-point" aria-label="绩点">—</output></td>
    <td class="col-term"><input type="text" class="c-term" placeholder="2025-2026-1" /></td>
    <td><button type="button" class="row-remove" title="删除" aria-label="删除该行">&times;</button></td>`
  tr.querySelector('.c-name').value = course.name ?? ''
  tr.querySelector('.c-credits').value = course.credits ?? ''
  const scoreInput = tr.querySelector('.c-score')
  const pointOutput = tr.querySelector('.c-point')
  scoreInput.value = course.grade || (course.score ?? '')
  pointOutput.textContent = course.point == null ? '—' : Number(course.point).toFixed(1)
  scoreInput.addEventListener('input', () => {
    pointOutput.textContent = '—'
  })
  tr.querySelector('.c-term').value = course.term ?? ''
  tr.querySelector('.row-remove').addEventListener('click', () => {
    tr.remove()
    if (!body.children.length) makeRow()
    updateCounts()
  })
  body.append(tr)
  return tr
}
function loadRows(list) {
  body.innerHTML = ''
  list.forEach((c) => makeRow(c))
  if (!body.children.length) makeRow()
  updateCounts()
}
function readCourse(tr) {
  const name = tr.querySelector('.c-name').value.trim()
  const credits = tr.querySelector('.c-credits').value.trim()
  const score = tr.querySelector('.c-score').value.trim()
  const term = tr.querySelector('.c-term').value.trim()
  if (!name && !credits && !score) return null
  const course = { name: name || undefined, credits: credits === '' ? null : Number(credits) }
  if (score !== '') course.score = score
  if (term !== '') course.term = term
  return course
}
function readCourseEntries() {
  return Array.from(body.querySelectorAll('tr'), (row) => ({ row, course: readCourse(row) }))
    .filter((entry) => entry.course)
}
function fillCoursePoints(courses, entries) {
  courses.forEach((course, index) => {
    const entry = entries[index]
    if (!entry?.row.isConnected || JSON.stringify(readCourse(entry.row)) !== JSON.stringify(entry.course)) return
    entry.row.querySelector('.c-point').textContent = Number(course.point).toFixed(1)
  })
}
function updateCounts() {
  const n = body.querySelectorAll('tr').length
  $('#course-n').textContent = n + ' 门'
}

$('#addRow').addEventListener('click', () => makeRow())
$('#resetRows').addEventListener('click', () => {
  loadRows(SAMPLE)
  toast('已重置为示例成绩单')
})

/* ---------- result rendering ---------- */
const elGpa = $('#stat-gpa')
const elAvg = $('#stat-avg')
const elCredits = $('#stat-credits')
const elCount = $('#stat-count')
const reportBody = $('#report-body')
const reportStatus = $('#report-status')

function fillSummary(s) {
  if (!s) return
  elGpa.textContent = Number(s.gpa).toFixed(2)
  elAvg.textContent = Number(s.avg_score).toFixed(2)
  elCredits.textContent = Number(s.credits).toFixed(1)
  elCount.textContent = String(s.course_count)
}
function showReport(text, ok) {
  reportBody.textContent = text
  reportBody.classList.toggle('is-error', !ok)
  reportStatus.innerHTML = ok ? '<span class="ok">✓ 成功</span>' : '<span class="bad">✗ 失败</span>'
}

/* ---------- calculate (POST /api/calculate) ---------- */
const calcBtn = $('#calcBtn')
async function calculate() {
  const entries = readCourseEntries()
  const courses = entries.map((entry) => entry.course)
  if (!courses.length) {
    showReport('请至少录入一门课程。', false)
    return
  }
  const expression = $('#expression').value
  calcBtn.disabled = true
  try {
    const res = await fetch('/api/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courses, expression })
    })
    const data = await res.json()
    if (data.courses) fillCoursePoints(data.courses, entries)
    if (data.summary) fillSummary(data.summary)
    if (data.ok) {
      showReport(data.result ?? '', true)
    } else {
      const label = data.error_type ? `[${data.error_type}] ` : ''
      showReport(label + (data.error ?? '未知错误'), false)
    }
  } catch (err) {
    showReport('请求失败：' + err, false)
  } finally {
    calcBtn.disabled = false
  }
}
calcBtn.addEventListener('click', calculate)

/* ---------- Excel import (POST /api/import/xlsx) ---------- */
const fileInput = $('#xlsxFile')
const importBtn = $('#importBtn')
importBtn.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0]
  if (!file) return
  const form = new FormData()
  form.append('file', file)
  importBtn.disabled = true
  try {
    const res = await fetch('/api/import/xlsx', { method: 'POST', body: form })
    const data = await res.json()
    if (data.ok) {
      loadRows(data.courses || [])
      if (data.summary) fillSummary(data.summary)
      toast(`已导入「${data.sheet}」· ${data.courses?.length ?? 0} 门课程`)
    } else {
      const label = data.error_type ? `[${data.error_type}] ` : ''
      showReport(label + (data.error ?? '导入失败'), false)
      toast('导入失败')
    }
  } catch (err) {
    toast('导入失败：' + err)
  } finally {
    importBtn.disabled = false
    fileInput.value = ''
  }
})

/* ---------- init ---------- */
loadRows(SAMPLE)
