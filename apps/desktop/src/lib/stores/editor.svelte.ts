let isDirty = $state(false);
let showPreview = $state(true);
let showFuzzySearch = $state(false);
let showBacklinks = $state(false);
let showGitPanel = $state(false);
let searchMode = $state<"filename" | "fulltext" | "tree">("filename");

export function getEditorState() {
  return {
    get isDirty() {
      return isDirty;
    },
    set isDirty(v: boolean) {
      isDirty = v;
    },
    get showPreview() {
      return showPreview;
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
    get searchMode() {
      return searchMode;
    },
    set searchMode(v: "filename" | "fulltext" | "tree") {
      searchMode = v;
    },
  };
}

export function togglePreview() {
  showPreview = !showPreview;
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
