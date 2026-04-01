export const LEARNING_LOGS_DIR = '05_learning_logs'

export function getLearningLogPath(category: string, date?: Date): string {
  const d = date ?? new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${LEARNING_LOGS_DIR}/${category}/${yyyy}-${mm}-${dd}_${hh}${min}.md`
}
