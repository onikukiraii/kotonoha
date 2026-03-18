let isDirty = $state(false);
let showFuzzySearch = $state(false);
let showBacklinks = $state(false);
let showGitPanel = $state(false);
let livePreviewEnabled = $state(true);
let searchMode = $state<"filename" | "fulltext" | "tree">("filename");
let vimMode = $state("NORMAL");

export function getEditorState() {
  return {
    get isDirty() {
      return isDirty;
    },
    set isDirty(v: boolean) {
      isDirty = v;
    },
    get showFuzzySearch() {
      return showFuzzySearch;
    },
    get showBacklinks() {
      return showBacklinks;
    },
    get showGitPanel() {
      return showGitPanel;
    },
    get livePreviewEnabled() {
      return livePreviewEnabled;
    },
    get searchMode() {
      return searchMode;
    },
    set searchMode(v: "filename" | "fulltext" | "tree") {
      searchMode = v;
    },
    get vimMode() {
      return vimMode;
    },
    set vimMode(v: string) {
      vimMode = v;
    },
  };
}

export function toggleLivePreview() {
  livePreviewEnabled = !livePreviewEnabled;
}

export function toggleFuzzySearch(mode?: "filename" | "fulltext" | "tree") {
  if (mode) searchMode = mode;
  showFuzzySearch = !showFuzzySearch;
}

export function closeFuzzySearch() {
  showFuzzySearch = false;
}

export function toggleBacklinks() {
  showBacklinks = !showBacklinks;
}

export function toggleGitPanel() {
  showGitPanel = !showGitPanel;
}
