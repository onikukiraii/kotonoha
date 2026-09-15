import { getVaultState } from "./stores/vault.svelte";
import { showToast } from "./stores/toast.svelte";

/** vault 相対パスを絶対パスにしてクリップボードへ置く */
export function copyAbsolutePath(relativePath: string): void {
  const root = getVaultState().meta?.path;
  const absolute = root ? `${root}/${relativePath}` : relativePath;
  navigator.clipboard.writeText(absolute).then(
    () => showToast("パスをコピーしました"),
    (err: unknown) => showToast(`コピーできません: ${err}`),
  );
}
