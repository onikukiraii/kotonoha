interface ToastState {
  message: string;
  visible: boolean;
}

const state = $state<ToastState>({ message: "", visible: false });
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function getToastState() {
  return {
    get message() {
      return state.message;
    },
    get visible() {
      return state.visible;
    },
  };
}

export function showToast(message: string, durationMs = 1500): void {
  state.message = message;
  state.visible = true;
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    state.visible = false;
    hideTimer = null;
  }, durationMs);
}
