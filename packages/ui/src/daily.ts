export function getDailyNotePath(date?: Date): string {
  const d = date ?? new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `00_daily/${yyyy}/${mm}/${yyyy}-${mm}-${dd}.md`
}

export function getDailyNoteTemplate(): string {
  return `\n\n\n# 疑問\n\n## MNTSQ関連の疑問\n- [ ] \n## IT系の疑問\n- [ ] \n## その他疑問\n- [ ] \n\n# 学び\n- \n# 考えたこと\n- \n\n# 読書ログ\n- \n\n# フロントエンド積み上げ\n\n\n# やったこと\n- `
}
