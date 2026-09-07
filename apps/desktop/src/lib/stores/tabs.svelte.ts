import { isUnder, remapOpenPath } from "@kotonoha/ui/tree-move";
import { openFile, saveFile } from "./vault.svelte";
import { getEditorState } from "./editor.svelte";

export interface Tab {
  id: string;
  filePath: string;
  isDirty: boolean;
}

let tabs = $state<Tab[]>([]);
let activeTabId = $state<string | null>(null);

const editor = getEditorState();

export function getTabsState() {
  return {
    get tabs() {
      return tabs;
    },
    get activeTabId() {
      return activeTabId;
    },
    get activeTab(): Tab | undefined {
      return tabs.find((t) => t.id === activeTabId);
    },
  };
}

export async function openTab(filePath: string): Promise<void> {
  const existing = tabs.find((t) => t.filePath === filePath);
  if (existing) {
    await activateTab(existing.id);
    return;
  }

  // Save current tab if dirty before switching
  await saveActiveTabIfDirty();

  const tab: Tab = {
    id: filePath,
    filePath,
    isDirty: false,
  };
  tabs = [...tabs, tab];
  await openFile(filePath);
  activeTabId = tab.id;
  editor.isDirty = false;
}

export async function closeTab(tabId: string): Promise<void> {
  const idx = tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;

  // Save if dirty before closing
  const tab = tabs[idx];
  if (tab.isDirty) {
    const view = getEditorView();
    if (view && activeTabId === tabId) {
      await saveFile(tab.filePath, view.state.doc.toString());
    }
  }

  const wasActive = activeTabId === tabId;
  tabs = tabs.filter((t) => t.id !== tabId);

  if (wasActive) {
    if (tabs.length === 0) {
      activeTabId = null;
      editor.isDirty = false;
    } else {
      // Activate nearest tab
      const newIdx = Math.min(idx, tabs.length - 1);
      await openFile(tabs[newIdx].filePath);
      activeTabId = tabs[newIdx].id;
      editor.isDirty = tabs[newIdx].isDirty;
    }
  }
}

export async function activateTab(tabId: string): Promise<void> {
  if (activeTabId === tabId) return;
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return;

  await saveActiveTabIfDirty();

  await openFile(tab.filePath);
  activeTabId = tabId;
  editor.isDirty = tab.isDirty;
}

export function setTabDirty(tabId: string, dirty: boolean): void {
  const tab = tabs.find((t) => t.id === tabId);
  if (tab) {
    tab.isDirty = dirty;
  }
}

export async function activateNextTab(): Promise<void> {
  if (tabs.length <= 1) return;
  const idx = tabs.findIndex((t) => t.id === activeTabId);
  const nextIdx = (idx + 1) % tabs.length;
  await activateTab(tabs[nextIdx].id);
}

export async function activatePrevTab(): Promise<void> {
  if (tabs.length <= 1) return;
  const idx = tabs.findIndex((t) => t.id === activeTabId);
  const prevIdx = (idx - 1 + tabs.length) % tabs.length;
  await activateTab(tabs[prevIdx].id);
}

/**
 * 削除されたファイル・フォルダ配下のタブを、保存せずに閉じる。
 * closeTab は dirty なら書き戻すので、削除の後始末には使えない。
 */
export async function closeTabsUnder(pathOrDir: string): Promise<void> {
  const closing = tabs.filter((t) => isUnder(t.filePath, pathOrDir));
  if (closing.length === 0) return;

  const wasActive = closing.some((t) => t.id === activeTabId);
  const idx = tabs.findIndex((t) => t.id === activeTabId);
  tabs = tabs.filter((t) => !isUnder(t.filePath, pathOrDir));

  if (!wasActive) return;
  if (tabs.length === 0) {
    activeTabId = null;
    editor.isDirty = false;
    return;
  }
  const nextIdx = Math.min(Math.max(idx, 0), tabs.length - 1);
  await openFile(tabs[nextIdx].filePath);
  activeTabId = tabs[nextIdx].id;
  editor.isDirty = tabs[nextIdx].isDirty;
}

/** 移動・改名されたファイル・フォルダ配下のタブのパスを差し替える */
export function renameTabsUnder(from: string, to: string): void {
  for (const tab of tabs) {
    const remapped = remapOpenPath(tab.filePath, from, to);
    if (remapped === null || remapped === tab.filePath) continue;
    if (activeTabId === tab.id) {
      activeTabId = remapped;
    }
    tab.id = remapped;
    tab.filePath = remapped;
  }
}

// --- internal helpers ---

let editorViewRef: any = null;

export function setEditorViewRef(v: any): void {
  editorViewRef = v;
}

function getEditorView(): any {
  return editorViewRef;
}

async function saveActiveTabIfDirty(): Promise<void> {
  if (!activeTabId) return;
  const activeTab = tabs.find((t) => t.id === activeTabId);
  if (activeTab?.isDirty) {
    const view = getEditorView();
    if (view) {
      await saveFile(activeTab.filePath, view.state.doc.toString());
      activeTab.isDirty = false;
      editor.isDirty = false;
    }
  }
}
