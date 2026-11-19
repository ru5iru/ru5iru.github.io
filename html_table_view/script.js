"use strict";

const ROW_NUM_WIDTH = 74;
const PREF_KEY = "largeTableViewer.prefs.v2";

const els = {};
const state = {
  tables: [],
  tableIndex: 0,
  headers: [],
  rows: [],
  colOrder: [],
  colWidths: [],
  visible: [],
  pinned: new Set(),
  filters: {},
  filterCaseSensitive: false,
  filterRegex: false,
  filterError: "",
  dedupe: false,
  duplicateCount: 0,
  filteredIndexes: [],
  selectedRows: new Set(),
  lastSelectedFilteredPos: null,
  sorts: [],
  rowHeight: 34,
  normalRowHeight: 34,
  wrapRowHeight: 82,
  headerHeight: 34,
  buffer: 20,
  showColumnFilters: false,
  wrap: false,
  autoCollapseInput: true,
  findMatches: [],
  activeFind: -1,
  currentCell: null,
  currentCellText: "",
  currentCellFormats: null,
  cellViewMode: "formatted",
  cellWrap: true,
  cellSearchCase: false,
  cellSearchRegex: false,
  cellSearchGrep: false,
  cellSearchMatches: [],
  activeCellMatch: -1,
  diffBaseline: null,
  diffActive: false,
  currentRowIndex: null,
  activeProfileCol: null,
  undoSnapshot: null,
  debounceTimers: Object.create(null),
  totalWidth: 0,
  actualBodyHeight: 0,
  scrollBodyHeight: 0,
  maxScrollBodyHeight: 12000000,
  raf: 0
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

function init() {
  cacheElements();
  restorePreferences();
  wireEvents();
  updateStats();
}

function cacheElements() {
  [
    "dropOverlay", "tableInput", "fileInput", "delimiterSelect", "firstRowHeaderCheck", "autoCollapseCheck",
    "renderBtn", "clearBtn", "sampleBtn", "emptySampleBtn", "toggleInputBtn", "shortcutsBtn", "emptyShortcutsBtn", "themeBtn",
    "inputPanel", "globalFilter", "filterCaseBtn", "filterRegexBtn", "findInput", "prevFindBtn", "nextFindBtn", "findCount",
    "columnFiltersBtn", "dedupeBtn", "columnsBtn", "wrapBtn", "exportDropdown", "exportMenuBtn",
    "tableSelect", "main", "columnsList", "columnSearch", "showAllColumnsBtn", "hideEmptyColumnsBtn", "resetColumnsBtn",
    "message", "stats", "emptyState", "tableScroll", "gridCanvas", "gridHeader", "rowsLayer",
    "cellDialog", "cellTitle", "cellMeta", "cellContent", "copyCellBtn", "copyCellFormattedBtn", "closeCellBtn",
    "navLeftBtn", "navUpBtn", "navDownBtn", "navRightBtn", "openRowFromCellBtn",
    "toggleCellFormatBtn", "toggleCellWrapBtn", "pinDiffBtn", "toggleDiffBtn", "clearDiffBtn",
    "cellSearchInput", "cellSearchCaseBtn", "cellSearchRegexBtn", "cellSearchGrepBtn",
    "prevCellMatchBtn", "nextCellMatchBtn", "cellMatchCount",
    "rowDialog", "rowDialogTitle", "rowDialogMeta", "prevRowBtn", "nextRowBtn",
    "copyRowJsonBtn", "copyRowTsvBtn", "closeRowBtn", "rowFieldSearch", "rowHideEmptyCheck", "rowKvList",
    "columnStatsDialog", "colStatsTitle", "colStatsBody", "colStatsPinBtn", "colStatsAutofitBtn",
    "colStatsCopyAllBtn", "colStatsCopyUniqueBtn", "closeColStatsBtn",
    "shortcutsDialog", "closeShortcutsBtn"
  ].forEach(id => { els[id] = document.getElementById(id); });
}

function wireEvents() {
  els.renderBtn.addEventListener("click", renderFromInput);
  els.clearBtn.addEventListener("click", clearAll);
  els.sampleBtn.addEventListener("click", loadSampleData);
  els.emptySampleBtn.addEventListener("click", loadSampleData);
  els.toggleInputBtn.addEventListener("click", () => setInputPanelCollapsed(!els.inputPanel.classList.contains("collapsed")));
  els.themeBtn.addEventListener("click", toggleTheme);
  els.shortcutsBtn.addEventListener("click", () => els.shortcutsDialog.showModal());
  els.emptyShortcutsBtn.addEventListener("click", () => els.shortcutsDialog.showModal());
  els.closeShortcutsBtn.addEventListener("click", () => els.shortcutsDialog.close());
  els.fileInput.addEventListener("change", loadFile);
  els.autoCollapseCheck.addEventListener("change", () => {
    state.autoCollapseInput = els.autoCollapseCheck.checked;
    savePreferences();
  });
  els.delimiterSelect.addEventListener("change", () => { if (els.tableInput.value.trim()) renderFromInput(); });
  els.firstRowHeaderCheck.addEventListener("change", () => { if (els.tableInput.value.trim()) renderFromInput(); });

  els.globalFilter.addEventListener("input", () => debounce("global", () => applyFilters(true), 160));
  els.filterCaseBtn.addEventListener("click", () => {
    state.filterCaseSensitive = !state.filterCaseSensitive;
    els.filterCaseBtn.classList.toggle("active", state.filterCaseSensitive);
    applyFilters(true);
  });
  els.filterRegexBtn.addEventListener("click", () => {
    state.filterRegex = !state.filterRegex;
    els.filterRegexBtn.classList.toggle("active", state.filterRegex);
    applyFilters(true);
  });

  els.findInput.addEventListener("input", () => debounce("find", () => rebuildFindMatches(true), 160));
  els.findInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
      event.preventDefault();
      stepFind(event.shiftKey ? -1 : 1);
    }
  });
  els.prevFindBtn.addEventListener("click", () => stepFind(-1));
  els.nextFindBtn.addEventListener("click", () => stepFind(1));

  els.columnFiltersBtn.addEventListener("click", toggleColumnFilters);
  els.dedupeBtn.addEventListener("click", toggleDedupe);
  els.columnsBtn.addEventListener("click", toggleColumnsPanel);
  els.wrapBtn.addEventListener("click", toggleWrap);

  els.exportMenuBtn.addEventListener("click", event => {
    event.stopPropagation();
    const open = !els.exportDropdown.classList.contains("open");
    els.exportDropdown.classList.toggle("open", open);
    els.exportMenuBtn.setAttribute("aria-expanded", String(open));
  });
  els.exportDropdown.addEventListener("click", handleExportAction);
  document.addEventListener("click", event => {
    if (!els.exportDropdown.contains(event.target)) {
      els.exportDropdown.classList.remove("open");
      els.exportMenuBtn.setAttribute("aria-expanded", "false");
    }
  });

  els.showAllColumnsBtn.addEventListener("click", showAllColumns);
  els.hideEmptyColumnsBtn.addEventListener("click", hideEmptyColumns);
  els.resetColumnsBtn.addEventListener("click", resetColumnLayout);
  els.columnSearch.addEventListener("input", buildColumnsPanel);

  els.tableScroll.addEventListener("scroll", scheduleViewportRender, { passive: true });
  els.gridHeader.addEventListener("click", handleHeaderClick);
  els.gridHeader.addEventListener("input", handleColumnFilterInput);
  els.gridHeader.addEventListener("change", handleHeaderChange);
  els.gridHeader.addEventListener("mousedown", handleResizeStart);
  els.gridHeader.addEventListener("dblclick", handleHeaderDblClick);
  els.rowsLayer.addEventListener("click", handleRowsLayerClick);
  els.rowsLayer.addEventListener("keydown", handleRowsLayerKeydown);
  els.tableSelect.addEventListener("change", () => loadTable(Number(els.tableSelect.value)));

  // Cell dialog
  els.copyCellBtn.addEventListener("click", () => copyWithFeedback(state.currentCellText, els.copyCellBtn, "Copy raw"));
  els.copyCellFormattedBtn.addEventListener("click", () => copyWithFeedback(getCurrentCellDisplayText(), els.copyCellFormattedBtn, "Copy formatted"));
  els.closeCellBtn.addEventListener("click", () => els.cellDialog.close());
  els.navLeftBtn.addEventListener("click", () => navigateCellBy(0, -1));
  els.navRightBtn.addEventListener("click", () => navigateCellBy(0, 1));
  els.navUpBtn.addEventListener("click", () => navigateCellBy(-1, 0));
  els.navDownBtn.addEventListener("click", () => navigateCellBy(1, 0));
  els.openRowFromCellBtn.addEventListener("click", () => {
    if (!state.currentCell) return;
    const rowIndex = state.currentCell.rowIndex;
    els.cellDialog.close();
    openRowInspector(rowIndex);
  });
  els.toggleCellFormatBtn.addEventListener("click", () => {
    state.cellViewMode = state.cellViewMode === "formatted" ? "raw" : "formatted";
    renderCellContentView();
  });
  els.toggleCellWrapBtn.addEventListener("click", () => {
    state.cellWrap = !state.cellWrap;
    els.toggleCellWrapBtn.classList.toggle("active", state.cellWrap);
    els.cellContent.classList.toggle("nowrap", !state.cellWrap);
  });
  els.pinDiffBtn.addEventListener("click", pinCurrentCellForDiff);
  els.toggleDiffBtn.addEventListener("click", () => {
    state.diffActive = !state.diffActive;
    renderCellContentView();
  });
  els.clearDiffBtn.addEventListener("click", () => {
    state.diffBaseline = null;
    state.diffActive = false;
    renderCellContentView();
  });

  els.cellDialog.addEventListener("keydown", handleCellNavigation);
  els.cellDialog.addEventListener("close", () => {
    state.currentCell = null;
    renderViewport();
  });

  els.cellSearchInput.addEventListener("input", () => debounce("cellSearch", renderCellContentView, 100));
  els.cellSearchInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
      event.preventDefault();
      stepCellMatch(event.shiftKey ? -1 : 1);
    }
  });
  els.cellSearchCaseBtn.addEventListener("click", () => {
    state.cellSearchCase = !state.cellSearchCase;
    els.cellSearchCaseBtn.classList.toggle("active", state.cellSearchCase);
    renderCellContentView();
  });
  els.cellSearchRegexBtn.addEventListener("click", () => {
    state.cellSearchRegex = !state.cellSearchRegex;
    els.cellSearchRegexBtn.classList.toggle("active", state.cellSearchRegex);
    renderCellContentView();
  });
  els.cellSearchGrepBtn.addEventListener("click", () => {
    state.cellSearchGrep = !state.cellSearchGrep;
    els.cellSearchGrepBtn.classList.toggle("active", state.cellSearchGrep);
    renderCellContentView();
  });
  els.prevCellMatchBtn.addEventListener("click", () => stepCellMatch(-1));
  els.nextCellMatchBtn.addEventListener("click", () => stepCellMatch(1));

  // Row inspector dialog
  els.closeRowBtn.addEventListener("click", () => els.rowDialog.close());
  els.prevRowBtn.addEventListener("click", () => stepRowInspector(-1));
  els.nextRowBtn.addEventListener("click", () => stepRowInspector(1));
  els.rowFieldSearch.addEventListener("input", renderRowInspectorBody);
  els.rowHideEmptyCheck.addEventListener("change", renderRowInspectorBody);
  els.copyRowJsonBtn.addEventListener("click", () => copyCurrentRow("json", els.copyRowJsonBtn));
  els.copyRowTsvBtn.addEventListener("click", () => copyCurrentRow("tsv", els.copyRowTsvBtn));
  els.rowDialog.addEventListener("keydown", event => {
    if (event.target.closest("input, textarea, select")) return;
    if (event.key === "ArrowUp") { event.preventDefault(); stepRowInspector(-1); }
    else if (event.key === "ArrowDown") { event.preventDefault(); stepRowInspector(1); }
  });

  // Column stats dialog
  els.closeColStatsBtn.addEventListener("click", () => els.columnStatsDialog.close());
  els.colStatsPinBtn.addEventListener("click", () => {
    if (state.activeProfileCol === null) return;
    togglePinColumn(state.activeProfileCol);
    openColumnProfiler(state.activeProfileCol);
  });
  els.colStatsAutofitBtn.addEventListener("click", () => {
    if (state.activeProfileCol === null) return;
    autofitColumn(state.activeProfileCol);
  });
  els.colStatsCopyAllBtn.addEventListener("click", () => copyColumnValues(state.activeProfileCol, false, els.colStatsCopyAllBtn));
  els.colStatsCopyUniqueBtn.addEventListener("click", () => copyColumnValues(state.activeProfileCol, true, els.colStatsCopyUniqueBtn));

  [els.cellDialog, els.rowDialog, els.columnStatsDialog, els.shortcutsDialog].forEach(enableBackdropClose);

  wireDragAndDrop();
  window.addEventListener("resize", scheduleViewportRender);

  document.addEventListener("paste", event => {
    if (isAnyDialogOpen()) return;
    if (document.activeElement && document.activeElement.closest("input, textarea, select, [contenteditable]")) return;
    const text = event.clipboardData && event.clipboardData.getData("text/plain");
    if (text && text.trim()) {
      event.preventDefault();
      els.tableInput.value = text;
      renderFromInput();
    }
  });

  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      if (!isAnyDialogOpen()) renderFromInput();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      if (els.cellDialog.open) {
        els.cellSearchInput.focus();
        els.cellSearchInput.select();
      } else if (els.rowDialog.open) {
        els.rowFieldSearch.focus();
        els.rowFieldSearch.select();
      } else {
        els.findInput.focus();
        els.findInput.select();
      }
    } else if (event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (!isAnyDialogOpen() && !(document.activeElement && document.activeElement.closest("input, textarea, select"))) {
        event.preventDefault();
        els.shortcutsDialog.showModal();
      }
    } else if (event.key === "Escape") {
      if (els.exportDropdown.classList.contains("open")) {
        els.exportDropdown.classList.remove("open");
        els.exportMenuBtn.setAttribute("aria-expanded", "false");
      }
    }
  });
}

function enableBackdropClose(dialog) {
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) dialog.close();
  });
}

function isAnyDialogOpen() {
  return els.cellDialog.open || els.rowDialog.open || els.columnStatsDialog.open || els.shortcutsDialog.open;
}

function wireDragAndDrop() {
  let dragDepth = 0;
  window.addEventListener("dragenter", event => {
    if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes("Files")) return;
    event.preventDefault();
    dragDepth++;
    els.dropOverlay.classList.add("show");
  });
  window.addEventListener("dragover", event => {
    if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes("Files")) return;
    event.preventDefault();
  });
  window.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) els.dropOverlay.classList.remove("show");
  });
  window.addEventListener("drop", event => {
    dragDepth = 0;
    els.dropOverlay.classList.remove("show");
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (!file) return;
    event.preventDefault();
    readAndRenderFile(file);
  });
}

function restorePreferences() {
  try {
    const legacyTheme = localStorage.getItem("largeTableViewer.theme");
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
    const theme = saved.theme || legacyTheme || "light";
    document.body.dataset.theme = theme === "dark" ? "dark" : "light";
    els.themeBtn.textContent = document.body.dataset.theme === "dark" ? "Light" : "Dark";

    state.autoCollapseInput = saved.autoCollapseInput !== false;
    els.autoCollapseCheck.checked = state.autoCollapseInput;

    if (saved.wrap) {
      state.wrap = true;
      state.rowHeight = state.wrapRowHeight;
      document.documentElement.style.setProperty("--row-height", `${state.rowHeight}px`);
      els.gridCanvas.classList.add("wrap");
      els.wrapBtn.classList.add("active");
    }
    if (saved.showColumnFilters) {
      state.showColumnFilters = true;
      els.columnFiltersBtn.classList.add("active");
    }
  } catch (_) {}
  els.toggleCellWrapBtn.classList.add("active");
}

function savePreferences() {
  try {
    const prefs = {
      theme: document.body.dataset.theme,
      wrap: state.wrap,
      showColumnFilters: state.showColumnFilters,
      autoCollapseInput: state.autoCollapseInput
    };
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    localStorage.setItem("largeTableViewer.theme", prefs.theme);
  } catch (_) {}
}

function setInputPanelCollapsed(collapsed) {
  els.inputPanel.classList.toggle("collapsed", collapsed);
  els.toggleInputBtn.textContent = collapsed ? "Show input" : "Hide input";
  setTimeout(renderViewport, 60);
}

// ==================== PARSERS (PHASE 1) ====================

function renderFromInput() {
  const raw = els.tableInput.value;
  if (!raw || !raw.trim()) {
    showMessage("Paste HTML table, CSV/TSV, JSON, NDJSON, or Markdown data first.", "error");
    return;
  }

  try {
    const options = {
      delimiter: els.delimiterSelect.value,
      firstRowIsHeader: els.firstRowHeaderCheck.checked
    };
    const parsed = parseInput(raw, options);
    if (!parsed.length) throw new Error("No usable table rows were found.");
    state.undoSnapshot = null;
    state.tables = parsed;
    buildTableSelector();
    loadTable(0);
    if (state.autoCollapseInput) setInputPanelCollapsed(true);
    showMessage(`Loaded ${parsed[0].format} (${parsed[0].rows.length.toLocaleString()} rows × ${parsed[0].headers.length} columns).`, "success");
  } catch (error) {
    showMessage(`Could not render table: ${error.message}`, "error");
  }
}

function parseInput(raw, options = {}) {
  const trimmed = raw.replace(/^\uFEFF/, "").trim();
  const firstRowIsHeader = options.firstRowIsHeader !== false;

  if (/<table[\s>]/i.test(trimmed) && /<\/table\s*>/i.test(trimmed)) return parseHtmlTables(trimmed, firstRowIsHeader);

  const jsonResult = tryParseJsonOrNdjson(trimmed, firstRowIsHeader);
  if (jsonResult) return [jsonResult];

  const mdResult = tryParseMarkdownTable(trimmed, firstRowIsHeader);
  if (mdResult) return [mdResult];

  const delim = options.delimiter && options.delimiter !== "auto"
    ? options.delimiter
    : detectDelimiter(trimmed);
  return [parseDelimited(trimmed, delim, firstRowIsHeader)];
}

function parseHtmlTables(raw, firstRowIsHeader = true) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, "text/html");
  const tables = Array.from(doc.querySelectorAll("table"));
  return tables.map((table, tableIndex) => {
    const trs = Array.from(table.querySelectorAll("tr")).filter(tr => tr.closest("table") === table);
    if (!trs.length) return null;

    const grid = [];
    const occupied = [];
    let theadRowCount = 0;
    let firstRowHasTh = false;

    trs.forEach((tr, r) => {
      if (!grid[r]) grid[r] = [];
      if (!occupied[r]) occupied[r] = [];
      if (tr.parentElement && tr.parentElement.tagName === "THEAD") theadRowCount = Math.max(theadRowCount, r + 1);

      const cells = Array.from(tr.children).filter(el => /^(td|th)$/i.test(el.tagName));
      if (r === 0 && cells.some(c => c.tagName === "TH")) firstRowHasTh = true;

      let c = 0;
      for (const cell of cells) {
        while (occupied[r][c]) c++;
        const colspan = Math.max(1, Number(cell.getAttribute("colspan")) || 1);
        const rowspan = Math.max(1, Number(cell.getAttribute("rowspan")) || 1);
        const text = extractHtmlCellText(cell);
        for (let dr = 0; dr < rowspan; dr++) {
          const rr = r + dr;
          if (!grid[rr]) grid[rr] = [];
          if (!occupied[rr]) occupied[rr] = [];
          for (let dc = 0; dc < colspan; dc++) {
            const cc = c + dc;
            occupied[rr][cc] = true;
            grid[rr][cc] = (dr === 0 && dc === 0) ? text : (dc === 0 ? text : "");
          }
        }
        c += colspan;
      }
    });

    const nonEmptyRows = grid.filter(row => row && row.length);
    if (!nonEmptyRows.length) return null;
    const colCount = Math.max(...nonEmptyRows.map(row => row.length));
    const hasHeader = firstRowIsHeader && (theadRowCount > 0 || firstRowHasTh || nonEmptyRows.length > 1);
    const headerRowIndex = theadRowCount > 0 ? theadRowCount - 1 : 0;

    let headers;
    let bodyRows;
    if (hasHeader) {
      headers = makeUniqueHeaders(padRow(nonEmptyRows[headerRowIndex], colCount));
      const bodyStart = theadRowCount > 0 ? theadRowCount : 1;
      bodyRows = nonEmptyRows.slice(bodyStart).map(row => padRow(row, colCount));
    } else {
      headers = buildDefaultHeaders(colCount);
      bodyRows = nonEmptyRows.map(row => padRow(row, colCount));
    }
    return { name: `Table ${tableIndex + 1}`, format: "HTML table", headers, rows: bodyRows };
  }).filter(Boolean).filter(table => table.headers.length && table.rows.length);
}

function extractHtmlCellText(cell) {
  let out = "";
  const walk = node => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName;
      if (tag === "BR") { out += "\n"; return; }
      if (tag === "SCRIPT" || tag === "STYLE") return;
      const isBlock = /^(P|DIV|LI|TR|H[1-6]|PRE|BLOCKQUOTE)$/.test(tag);
      if (isBlock && out && !out.endsWith("\n")) out += "\n";
      for (const child of node.childNodes) walk(child);
      if (isBlock && out && !out.endsWith("\n")) out += "\n";
    }
  };
  walk(cell);
  return cleanRawCell(out);
}

function tryParseJsonOrNdjson(trimmed, firstRowIsHeader) {
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      let parsed = JSON.parse(trimmed);
      if (parsed && !Array.isArray(parsed) && typeof parsed === "object") {
        const arrayKeys = Object.keys(parsed).filter(k => Array.isArray(parsed[k]) && parsed[k].length);
        if (arrayKeys.length === 1) parsed = parsed[arrayKeys[0]];
        else parsed = [parsed];
      }
      if (Array.isArray(parsed) && parsed.length) {
        return buildTableFromJsonArray(parsed, "JSON", firstRowIsHeader);
      }
    } catch (_) {}
  }

  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length >= 2 && lines.every(l => l.startsWith("{") && l.endsWith("}"))) {
    try {
      const objects = lines.map(l => JSON.parse(l));
      if (objects.every(o => o && typeof o === "object" && !Array.isArray(o))) {
        return buildTableFromJsonArray(objects, "NDJSON", true);
      }
    } catch (_) {}
  }
  return null;
}

function buildTableFromJsonArray(arr, format, firstRowIsHeader) {
  if (arr.every(item => Array.isArray(item))) {
    const colCount = Math.max(...arr.map(r => r.length));
    const matrix = arr.map(r => padRow(r.map(stringifyJsonCell), colCount));
    if (firstRowIsHeader && matrix.length > 1) {
      return { name: format, format, headers: makeUniqueHeaders(matrix[0]), rows: matrix.slice(1) };
    }
    return { name: format, format, headers: buildDefaultHeaders(colCount), rows: matrix };
  }

  if (arr.some(item => item && typeof item === "object" && !Array.isArray(item))) {
    const keySet = [];
    const seen = new Set();
    for (const item of arr) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        for (const k of Object.keys(item)) {
          if (!seen.has(k)) { seen.add(k); keySet.push(k); }
        }
      }
    }
    if (!keySet.length) return null;
    const headers = makeUniqueHeaders(keySet);
    const rows = arr.map(item => keySet.map(k => (item && typeof item === "object") ? stringifyJsonCell(item[k]) : ""));
    return { name: format, format, headers, rows };
  }

  return { name: format, format, headers: ["Value"], rows: arr.map(v => [stringifyJsonCell(v)]) };
}

function stringifyJsonCell(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return cleanRawCell(String(v));
}

function tryParseMarkdownTable(trimmed, firstRowIsHeader) {
  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const sepRe = /^\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?$/;
  if (!sepRe.test(lines[1])) return null;

  const splitMdRow = line => {
    let s = line.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
    const cells = [];
    let cur = "";
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "\\" && s[i + 1] === "|") { cur += "|"; i++; }
      else if (s[i] === "|") { cells.push(cleanRawCell(cur)); cur = ""; }
      else { cur += s[i]; }
    }
    cells.push(cleanRawCell(cur));
    return cells;
  };

  const headerCells = splitMdRow(lines[0]);
  const bodyLines = lines.slice(2).filter(l => l.includes("|"));
  if (!bodyLines.length) return null;
  const bodyMatrix = bodyLines.map(splitMdRow);
  const colCount = Math.max(headerCells.length, ...bodyMatrix.map(r => r.length));
  const headers = firstRowIsHeader ? makeUniqueHeaders(padRow(headerCells, colCount)) : buildDefaultHeaders(colCount);
  const rows = (firstRowIsHeader ? bodyMatrix : [headerCells, ...bodyMatrix]).map(r => padRow(r, colCount));
  return { name: "Markdown table", format: "Markdown table", headers, rows };
}

function detectDelimiter(raw) {
  const sample = raw.slice(0, 6000);
  const candidates = ["\t", ",", ";", "|"];
  const counts = { "\t": [], ",": [], ";": [], "|": [] };
  let inQuotes = false;
  let lineCounts = { "\t": 0, ",": 0, ";": 0, "|": 0 };
  let linesSeen = 0;

  for (let i = 0; i < sample.length && linesSeen < 12; i++) {
    const ch = sample[i];
    if (ch === '"') {
      if (inQuotes && sample[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && sample[i + 1] === "\n") i++;
      candidates.forEach(d => counts[d].push(lineCounts[d]));
      lineCounts = { "\t": 0, ",": 0, ";": 0, "|": 0 };
      linesSeen++;
    } else if (!inQuotes && lineCounts[ch] !== undefined) {
      lineCounts[ch]++;
    }
  }
  if (Object.values(lineCounts).some(v => v > 0)) {
    candidates.forEach(d => counts[d].push(lineCounts[d]));
  }

  let best = ",";
  let bestScore = -1;
  for (const d of candidates) {
    const arr = counts[d].filter(n => n > 0);
    if (!arr.length) continue;
    const total = arr.reduce((a, b) => a + b, 0);
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const consistency = min === max ? 2 : 1;
    const score = total * consistency + (d === "\t" ? 0.5 : 0);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function parseDelimited(raw, delimiter, firstRowIsHeader = true) {
  const matrix = parseDelimitedMatrix(raw, delimiter);
  if (!matrix.length) throw new Error("No rows found.");
  const colCount = Math.max(...matrix.map(row => row.length));
  const labelMap = { ",": "CSV", "\t": "TSV", ";": "Semicolon-delimited", "|": "Pipe-delimited" };
  const format = labelMap[delimiter] || "Delimited";
  if (firstRowIsHeader && matrix.length > 1) {
    const headers = makeUniqueHeaders(padRow(matrix[0].map(collapsePreview), colCount));
    const rows = matrix.slice(1).map(row => padRow(row, colCount));
    return { name: format, format, headers, rows };
  }
  const headers = buildDefaultHeaders(colCount);
  const rows = matrix.map(row => padRow(row, colCount));
  return { name: format, format, headers, rows };
}

function parseDelimitedMatrix(raw, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = raw.length;

  while (i < len) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
    } else {
      if (ch === '"' && field === "") {
        inQuotes = true;
        i++;
      } else if (ch === delimiter) {
        row.push(cleanRawCell(field));
        field = "";
        i++;
      } else if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && raw[i + 1] === "\n") i++;
        row.push(cleanRawCell(field));
        if (row.some(cell => cell !== "")) rows.push(row);
        row = [];
        field = "";
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }
  row.push(cleanRawCell(field));
  if (row.some(cell => cell !== "")) rows.push(row);
  return rows;
}

function cleanRawCell(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").trim();
}

function collapsePreview(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function padRow(row, size) {
  const copy = row.slice(0, size);
  while (copy.length < size) copy.push("");
  return copy;
}

function buildDefaultHeaders(count) {
  return Array.from({ length: count }, (_, index) => `Column ${index + 1}`);
}

function makeUniqueHeaders(headers) {
  const seen = new Map();
  return headers.map((name, index) => {
    const base = collapsePreview(name) || `Column ${index + 1}`;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

function buildTableSelector() {
  els.tableSelect.innerHTML = "";
  if (state.tables.length <= 1) {
    els.tableSelect.classList.add("hidden");
    return;
  }
  state.tables.forEach((table, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${table.name} · ${table.rows.length.toLocaleString()} rows · ${table.headers.length} cols`;
    els.tableSelect.appendChild(option);
  });
  els.tableSelect.classList.remove("hidden");
}

function loadTable(index) {
  const table = state.tables[index];
  if (!table) return;
  state.tableIndex = index;
  state.headers = table.headers;
  state.rows = table.rows;
  state.colOrder = state.headers.map((_, col) => col);
  state.colWidths = state.headers.map((header, col) => suggestColumnWidth(header, state.rows, col));
  state.visible = state.headers.map(() => true);
  state.pinned = new Set();
  state.filters = {};
  state.sorts = [];
  state.selectedRows = new Set();
  state.lastSelectedFilteredPos = null;
  state.findMatches = [];
  state.activeFind = -1;
  state.currentCell = null;
  state.diffBaseline = null;
  state.diffActive = false;
  els.globalFilter.value = "";
  els.findInput.value = "";
  els.tableSelect.value = String(index);
  els.emptyState.classList.add("hidden");
  els.tableScroll.classList.remove("hidden");
  els.tableScroll.scrollTop = 0;
  els.tableScroll.scrollLeft = 0;
  buildColumnsPanel();
  applyFilters(false);
}

function suggestColumnWidth(header, rows, col, sampleLimit = 80, maxPx = 320) {
  let maxLen = String(header || "").length + 4;
  const sampleSize = Math.min(rows.length, sampleLimit);
  for (let i = 0; i < sampleSize; i++) {
    const preview = collapsePreview(rows[i][col] || "");
    maxLen = Math.max(maxLen, Math.min(preview.length, Math.floor(maxPx / 7)));
  }
  return Math.max(90, Math.min(maxPx, maxLen * 7 + 44));
}

// ==================== COLUMN ORDER & PINNING ====================

function visibleColumns() {
  const visibleOrdered = state.colOrder.filter(col => state.visible[col]);
  const pinnedCols = visibleOrdered.filter(col => state.pinned.has(col));
  const unpinnedCols = visibleOrdered.filter(col => !state.pinned.has(col));
  return [...pinnedCols, ...unpinnedCols];
}

function stickyMeta(cols) {
  const offsets = new Map();
  let left = ROW_NUM_WIDTH;
  let lastPinnedCol = null;
  for (const col of cols) {
    if (state.pinned.has(col)) {
      offsets.set(col, left);
      left += state.colWidths[col];
      lastPinnedCol = col;
    }
  }
  return { offsets, stickyWidth: left, lastPinnedCol };
}

function gridTemplate(cols) {
  return `${ROW_NUM_WIDTH}px ` + cols.map(col => `${state.colWidths[col]}px`).join(" ");
}

function updateGridSize() {
  const cols = visibleColumns();
  state.totalWidth = ROW_NUM_WIDTH + cols.reduce((sum, col) => sum + state.colWidths[col], 0);
  state.headerHeight = state.showColumnFilters ? 68 : 34;
  state.actualBodyHeight = state.filteredIndexes.length * state.rowHeight;
  state.scrollBodyHeight = Math.min(state.actualBodyHeight, state.maxScrollBodyHeight);
  const canvasHeight = state.headerHeight + Math.max(state.scrollBodyHeight, state.filteredIndexes.length === 0 ? 180 : 0);
  const widthPx = `${Math.max(state.totalWidth, els.tableScroll.clientWidth || 0)}px`;
  const heightPx = `${Math.max(canvasHeight, els.tableScroll.clientHeight || 0)}px`;
  els.gridCanvas.style.width = widthPx;
  els.gridCanvas.style.height = heightPx;
  els.gridHeader.style.width = widthPx;
  els.rowsLayer.style.width = widthPx;
  els.rowsLayer.style.height = heightPx;
}

// ==================== FILTERING & MULTI-SORT (PHASE 2) ====================

function compileFilterPredicate(rawExpr, { regex, caseSensitive }) {
  const trimmed = String(rawExpr ?? "").trim();
  if (!trimmed) return { fn: null, error: "" };

  if (regex) {
    try {
      const re = new RegExp(trimmed, caseSensitive ? "" : "i");
      return { fn: value => re.test(value), error: "" };
    } catch (err) {
      return { fn: null, error: `Invalid regex "${trimmed}": ${err.message}` };
    }
  }

  if (trimmed.startsWith("!") && trimmed.length > 1) {
    const inner = compileFilterPredicate(trimmed.slice(1), { regex: false, caseSensitive });
    if (inner.error) return inner;
    return { fn: value => !inner.fn(value), error: "" };
  }

  const lower = trimmed.toLowerCase();
  if (lower === "is:empty") return { fn: value => value.trim() === "", error: "" };
  if (lower === "is:nonempty") return { fn: value => value.trim() !== "", error: "" };

  if (trimmed.startsWith("=")) {
    let target = trimmed.slice(1);
    if ((target.startsWith('"') && target.endsWith('"')) || (target.startsWith("'") && target.endsWith("'"))) {
      target = target.slice(1, -1);
    }
    const expected = caseSensitive ? target : target.toLowerCase();
    return {
      fn: value => {
        const v = value.trim();
        return (caseSensitive ? v : v.toLowerCase()) === expected;
      },
      error: ""
    };
  }

  const rangeMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/);
  if (rangeMatch) {
    const lo = Number(rangeMatch[1]);
    const hi = Number(rangeMatch[2]);
    const min = Math.min(lo, hi);
    const max = Math.max(lo, hi);
    return {
      fn: value => {
        const n = parseNumeric(value);
        return n !== null && n >= min && n <= max;
      },
      error: ""
    };
  }

  const cmpMatch = trimmed.match(/^(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/);
  if (cmpMatch) {
    const op = cmpMatch[1];
    const rhs = Number(cmpMatch[2]);
    return {
      fn: value => {
        const n = parseNumeric(value);
        if (n === null) return false;
        if (op === ">") return n > rhs;
        if (op === ">=") return n >= rhs;
        if (op === "<") return n < rhs;
        return n <= rhs;
      },
      error: ""
    };
  }

  const needle = caseSensitive ? trimmed : trimmed.toLowerCase();
  return {
    fn: value => (caseSensitive ? value : value.toLowerCase()).includes(needle),
    error: ""
  };
}

function parseNumeric(value) {
  const s = String(value ?? "").trim().replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function applyFilters(resetScroll = true) {
  const opts = { regex: state.filterRegex, caseSensitive: state.filterCaseSensitive };
  const globalCompiled = compileFilterPredicate(els.globalFilter.value, opts);
  let firstError = globalCompiled.error;

  const activeColPredicates = [];
  for (const [colKey, val] of Object.entries(state.filters)) {
    if (!String(val).trim()) continue;
    const compiled = compileFilterPredicate(val, opts);
    if (compiled.error && !firstError) firstError = compiled.error;
    if (compiled.fn) activeColPredicates.push([Number(colKey), compiled.fn]);
  }

  state.filterError = firstError;
  if (firstError) showMessage(firstError, "error");
  else if (els.message.classList.contains("error")) els.message.className = "message";

  const cols = visibleColumns();
  const result = [];
  const seenKeys = state.dedupe ? new Set() : null;
  let duplicateCount = 0;

  for (let i = 0; i < state.rows.length; i++) {
    const row = state.rows[i];
    let pass = true;

    if (globalCompiled.fn) {
      pass = cols.some(col => globalCompiled.fn(String(row[col] ?? "")));
    }
    if (pass && activeColPredicates.length) {
      for (const [col, fn] of activeColPredicates) {
        if (!fn(String(row[col] ?? ""))) { pass = false; break; }
      }
    }
    if (pass && seenKeys) {
      const key = cols.map(col => row[col] ?? "").join("\u0001");
      if (seenKeys.has(key)) { duplicateCount++; continue; }
      seenKeys.add(key);
    }
    if (pass) result.push(i);
  }

  state.duplicateCount = duplicateCount;
  if (state.sorts.length) sortIndexesMulti(result, state.sorts);

  state.filteredIndexes = result;
  if (resetScroll) els.tableScroll.scrollTop = 0;
  updateFilterBadges();
  buildHeader();
  rebuildFindMatches(false);
  renderViewport();
  updateStats();
}

function sortIndexesMulti(indexes, sorts) {
  indexes.sort((a, b) => {
    for (const { col, dir } of sorts) {
      const cmp = compareValues(state.rows[a][col], state.rows[b][col]);
      if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
    }
    return a - b;
  });
}

function compareValues(a, b) {
  const av = String(a ?? "").trim();
  const bv = String(b ?? "").trim();
  const an = parseNumeric(av);
  const bn = parseNumeric(bv);
  if (an !== null && bn !== null) return an - bn;
  return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
}

function countActiveColumnFilters() {
  return Object.values(state.filters).filter(v => String(v || "").trim() !== "").length;
}

function updateFilterBadges() {
  const colCount = countActiveColumnFilters();
  els.columnFiltersBtn.textContent = colCount ? `Column filters (${colCount})` : "Column filters";
  els.columnFiltersBtn.classList.toggle("active", state.showColumnFilters || colCount > 0);
}

function resetAllFilters() {
  els.globalFilter.value = "";
  state.filters = {};
  state.dedupe = false;
  els.dedupeBtn.classList.remove("active");
  applyFilters(true);
}

// ==================== HEADER & VIRTUAL GRID RENDERING ====================

function buildHeader() {
  const activeEl = document.activeElement;
  const focusedFilter = activeEl && els.gridHeader.contains(activeEl) && activeEl.dataset && activeEl.dataset.filterCol !== undefined
    ? { col: activeEl.dataset.filterCol, start: activeEl.selectionStart, end: activeEl.selectionEnd }
    : null;

  const cols = visibleColumns();
  const template = gridTemplate(cols);
  const sticky = stickyMeta(cols);
  els.gridHeader.innerHTML = "";
  updateGridSize();

  if (!cols.length) return;

  const headerRow = document.createElement("div");
  headerRow.className = "grid-row header-main";
  headerRow.style.gridTemplateColumns = template;

  // Sticky row-number / select-all corner cell
  const corner = document.createElement("div");
  corner.className = "grid-head-cell sticky-col row-number" + (sticky.lastPinnedCol === null ? " pin-edge" : "");
  corner.style.left = "0px";
  const selectAll = document.createElement("input");
  selectAll.type = "checkbox";
  selectAll.dataset.selectAll = "1";
  selectAll.title = "Select or deselect all filtered rows";
  selectAll.checked = state.filteredIndexes.length > 0 && state.filteredIndexes.every(idx => state.selectedRows.has(idx));
  selectAll.indeterminate = !selectAll.checked && state.filteredIndexes.some(idx => state.selectedRows.has(idx));
  const hashSpan = document.createElement("span");
  hashSpan.textContent = "#";
  hashSpan.style.fontSize = "11px";
  corner.append(selectAll, hashSpan);
  headerRow.appendChild(corner);

  cols.forEach(col => {
    const cell = document.createElement("div");
    const isPinned = sticky.offsets.has(col);
    cell.className = "grid-head-cell" + (isPinned ? " sticky-col" : "") + (sticky.lastPinnedCol === col ? " pin-edge" : "");
    if (isPinned) cell.style.left = `${sticky.offsets.get(col)}px`;
    cell.dataset.headCol = String(col);

    const inner = document.createElement("div");
    inner.className = "head-cell-inner";

    const sortBtn = document.createElement("button");
    sortBtn.type = "button";
    sortBtn.className = "sort-button";
    sortBtn.dataset.sortCol = String(col);
    sortBtn.title = `${state.headers[col]} — Click to sort, Shift+Click to multi-sort`;

    const title = document.createElement("span");
    title.className = "head-title";
    title.textContent = state.headers[col];

    const sortMeta = getSortBadge(col);
    const icon = document.createElement("span");
    icon.className = "sort-indicator" + (sortMeta.sorted ? " sorted" : "");
    icon.textContent = sortMeta.label;

    sortBtn.append(title, icon);

    const tools = document.createElement("div");
    tools.className = "head-tools";

    const statsBtn = document.createElement("button");
    statsBtn.type = "button";
    statsBtn.className = "head-tool-btn";
    statsBtn.dataset.profileCol = String(col);
    statsBtn.title = `Profile column "${state.headers[col]}" (stats & top values)`;
    statsBtn.textContent = "▤";

    const pinBtn = document.createElement("button");
    pinBtn.type = "button";
    pinBtn.className = "head-tool-btn" + (isPinned ? " active" : "");
    pinBtn.dataset.pinCol = String(col);
    pinBtn.title = isPinned ? "Unpin column" : "Pin column to left";
    pinBtn.textContent = "📌";

    tools.append(statsBtn, pinBtn);
    inner.append(sortBtn, tools);

    const resizer = document.createElement("div");
    resizer.className = "col-resizer";
    resizer.dataset.resizeCol = String(col);
    resizer.title = "Drag to resize · Double-click to auto-fit";

    cell.append(inner, resizer);
    headerRow.appendChild(cell);
  });

  els.gridHeader.appendChild(headerRow);

  if (state.showColumnFilters) {
    const filterRow = document.createElement("div");
    filterRow.className = "grid-row header-filters";
    filterRow.style.gridTemplateColumns = template;

    const cornerFilter = document.createElement("div");
    cornerFilter.className = "grid-cell filter-cell sticky-col" + (sticky.lastPinnedCol === null ? " pin-edge" : "");
    cornerFilter.style.left = "0px";
    filterRow.appendChild(cornerFilter);

    cols.forEach(col => {
      const isPinned = sticky.offsets.has(col);
      const cell = document.createElement("div");
      cell.className = "grid-cell filter-cell" + (isPinned ? " sticky-col" : "") + (sticky.lastPinnedCol === col ? " pin-edge" : "");
      if (isPinned) cell.style.left = `${sticky.offsets.get(col)}px`;
      const input = document.createElement("input");
      input.type = "search";
      input.dataset.filterCol = String(col);
      input.placeholder = "Filter...";
      input.value = state.filters[col] || "";
      if (input.value.trim()) input.classList.add("has-filter");
      cell.appendChild(input);
      filterRow.appendChild(cell);
    });
    els.gridHeader.appendChild(filterRow);
  }

  if (focusedFilter) {
    const nextInput = els.gridHeader.querySelector(`input[data-filter-col="${focusedFilter.col}"]`);
    if (nextInput) {
      nextInput.focus({ preventScroll: true });
      if (typeof focusedFilter.start === "number" && typeof focusedFilter.end === "number") {
        try { nextInput.setSelectionRange(focusedFilter.start, focusedFilter.end); } catch (_) {}
      }
    }
  }
}

function getSortBadge(col) {
  const idx = state.sorts.findIndex(s => s.col === col);
  if (idx < 0) return { sorted: false, label: "↕" };
  const arrow = state.sorts[idx].dir === "asc" ? "↑" : "↓";
  return { sorted: true, label: state.sorts.length > 1 ? `${idx + 1}${arrow}` : arrow };
}

function bodyViewportHeight() {
  return Math.max(1, els.tableScroll.clientHeight - state.headerHeight);
}

function physicalToData(physicalTop) {
  if (state.actualBodyHeight <= state.scrollBodyHeight) return physicalTop;
  const maxPhysicalTop = Math.max(1, state.scrollBodyHeight - bodyViewportHeight());
  const maxDataTop = Math.max(1, state.actualBodyHeight - bodyViewportHeight());
  return Math.min(maxDataTop, Math.max(0, physicalTop) / maxPhysicalTop * maxDataTop);
}

function dataToPhysical(dataTop) {
  if (state.actualBodyHeight <= state.scrollBodyHeight) return dataTop;
  const maxPhysicalTop = Math.max(1, state.scrollBodyHeight - bodyViewportHeight());
  const maxDataTop = Math.max(1, state.actualBodyHeight - bodyViewportHeight());
  return Math.min(maxPhysicalTop, Math.max(0, dataTop) / maxDataTop * maxPhysicalTop);
}

function scheduleViewportRender() {
  if (state.raf) return;
  state.raf = requestAnimationFrame(() => {
    state.raf = 0;
    renderViewport();
  });
}

function renderViewport() {
  const cols = visibleColumns();
  els.rowsLayer.innerHTML = "";
  updateGridSize();

  if (!state.rows.length || !cols.length) {
    updateStats();
    return;
  }

  const total = state.filteredIndexes.length;
  if (total === 0) {
    const zero = document.createElement("div");
    zero.className = "zero-results";
    zero.style.marginTop = `${state.headerHeight}px`;
    const msg = document.createElement("div");
    msg.textContent = "No rows match the current filter criteria.";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn primary sm";
    btn.textContent = "Reset filters";
    btn.addEventListener("click", resetAllFilters);
    zero.append(msg, btn);
    els.rowsLayer.appendChild(zero);
    return;
  }

  const scrollTop = els.tableScroll.scrollTop;
  const dataTop = physicalToData(scrollTop);
  const viewHeight = bodyViewportHeight();
  const start = Math.max(0, Math.floor(dataTop / state.rowHeight) - state.buffer);
  const dataBottom = dataTop + viewHeight + state.buffer * state.rowHeight;
  const end = Math.min(total, Math.ceil(dataBottom / state.rowHeight) + state.buffer);
  const template = gridTemplate(cols);
  const sticky = stickyMeta(cols);
  const globalCompiled = compileFilterPredicate(els.globalFilter.value, {
    regex: state.filterRegex,
    caseSensitive: state.filterCaseSensitive
  });
  const activeFind = state.findMatches[state.activeFind];
  const fragment = document.createDocumentFragment();

  for (let pos = start; pos < end; pos++) {
    const actualIndex = state.filteredIndexes[pos];
    const row = document.createElement("div");
    row.className = "virtual-row" + (pos % 2 === 1 ? " row-even" : "") + (state.selectedRows.has(actualIndex) ? " row-selected" : "");
    row.dataset.filteredPos = String(pos);
    row.dataset.rowIndex = String(actualIndex);
    row.style.gridTemplateColumns = template;
    const rowOffset = state.headerHeight + scrollTop + (pos * state.rowHeight - dataTop);
    row.style.top = `${rowOffset}px`;
    row.style.height = `${state.rowHeight}px`;

    // Sticky row-number + checkbox cell
    const numCell = document.createElement("div");
    numCell.className = "grid-cell sticky-col row-number" + (sticky.lastPinnedCol === null ? " pin-edge" : "");
    numCell.style.left = "0px";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.selectRow = String(actualIndex);
    cb.dataset.filteredPos = String(pos);
    cb.checked = state.selectedRows.has(actualIndex);
    cb.title = "Select row (Shift+Click for range)";
    const numBtn = document.createElement("button");
    numBtn.type = "button";
    numBtn.className = "row-num-btn";
    numBtn.dataset.inspectRow = String(actualIndex);
    numBtn.title = `Inspect full row ${actualIndex + 1}`;
    numBtn.textContent = String(actualIndex + 1);
    numCell.append(cb, numBtn);
    row.appendChild(numCell);

    cols.forEach(col => {
      const isPinned = sticky.offsets.has(col);
      const cell = document.createElement("div");
      cell.className = "grid-cell" + (isPinned ? " sticky-col" : "") + (sticky.lastPinnedCol === col ? " pin-edge" : "");
      if (isPinned) cell.style.left = `${sticky.offsets.get(col)}px`;

      const rawText = String(state.rows[actualIndex][col] ?? "");
      const preview = state.wrap ? rawText : collapsePreview(rawText);
      cell.textContent = preview;
      cell.title = preview.length > 160 ? preview.slice(0, 160) + "…" : preview;
      cell.tabIndex = 0;
      cell.dataset.row = String(actualIndex);
      cell.dataset.col = String(col);
      cell.dataset.filteredPos = String(pos);

      if (globalCompiled.fn && globalCompiled.fn(rawText)) cell.classList.add("cell-match");
      if (activeFind && activeFind.filteredPos === pos && activeFind.col === col) cell.classList.add("active-find");
      if (state.currentCell && state.currentCell.rowIndex === actualIndex && state.currentCell.col === col) cell.classList.add("active-cell");
      row.appendChild(cell);
    });
    fragment.appendChild(row);
  }

  els.rowsLayer.appendChild(fragment);
}

// ==================== HEADER & COLUMN INTERACTIONS (PHASE 3) ====================

function handleHeaderClick(event) {
  const profileBtn = event.target.closest("button[data-profile-col]");
  if (profileBtn) {
    openColumnProfiler(Number(profileBtn.dataset.profileCol));
    return;
  }
  const pinBtn = event.target.closest("button[data-pin-col]");
  if (pinBtn) {
    togglePinColumn(Number(pinBtn.dataset.pinCol));
    return;
  }
  const sortBtn = event.target.closest("button[data-sort-col]");
  if (!sortBtn) return;
  const col = Number(sortBtn.dataset.sortCol);
  const existingIdx = state.sorts.findIndex(s => s.col === col);

  if (event.shiftKey) {
    if (existingIdx < 0) state.sorts.push({ col, dir: "asc" });
    else if (state.sorts[existingIdx].dir === "asc") state.sorts[existingIdx].dir = "desc";
    else state.sorts.splice(existingIdx, 1);
  } else {
    if (existingIdx === 0 && state.sorts.length === 1) {
      if (state.sorts[0].dir === "asc") state.sorts = [{ col, dir: "desc" }];
      else state.sorts = [];
    } else {
      state.sorts = [{ col, dir: "asc" }];
    }
  }
  applyFilters(true);
}

function handleHeaderChange(event) {
  const selectAll = event.target.closest("input[data-select-all]");
  if (!selectAll) return;
  if (selectAll.checked) {
    state.filteredIndexes.forEach(idx => state.selectedRows.add(idx));
  } else {
    state.filteredIndexes.forEach(idx => state.selectedRows.delete(idx));
  }
  renderViewport();
  updateStats();
}

function handleColumnFilterInput(event) {
  const input = event.target.closest("input[data-filter-col]");
  if (!input) return;
  const col = Number(input.dataset.filterCol);
  state.filters[col] = input.value;
  input.classList.toggle("has-filter", input.value.trim() !== "");
  debounce(`col-${col}`, () => applyFilters(true), 160);
}

function handleResizeStart(event) {
  const resizer = event.target.closest(".col-resizer[data-resize-col]");
  if (!resizer) return;
  event.preventDefault();
  event.stopPropagation();
  const col = Number(resizer.dataset.resizeCol);
  const startX = event.clientX;
  const startWidth = state.colWidths[col];
  resizer.classList.add("resizing");

  const onMove = moveEvent => {
    const nextWidth = Math.max(64, Math.min(900, Math.round(startWidth + (moveEvent.clientX - startX))));
    if (nextWidth === state.colWidths[col]) return;
    state.colWidths[col] = nextWidth;
    applyWidthsLive();
  };
  const onUp = () => {
    resizer.classList.remove("resizing");
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    buildHeader();
    renderViewport();
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function handleHeaderDblClick(event) {
  const resizer = event.target.closest(".col-resizer[data-resize-col]");
  if (!resizer) return;
  autofitColumn(Number(resizer.dataset.resizeCol));
}

function autofitColumn(col) {
  const sampleRows = state.filteredIndexes.slice(0, 400).map(i => state.rows[i]);
  state.colWidths[col] = suggestColumnWidth(state.headers[col], sampleRows.length ? sampleRows : state.rows, col, 400, 620);
  buildHeader();
  renderViewport();
}

function applyWidthsLive() {
  const cols = visibleColumns();
  const template = gridTemplate(cols);
  const sticky = stickyMeta(cols);
  updateGridSize();
  els.gridHeader.querySelectorAll(".grid-row").forEach(r => { r.style.gridTemplateColumns = template; });
  els.rowsLayer.querySelectorAll(".virtual-row").forEach(r => { r.style.gridTemplateColumns = template; });
  cols.forEach(col => {
    if (!sticky.offsets.has(col)) return;
    const leftPx = `${sticky.offsets.get(col)}px`;
    els.gridHeader.querySelectorAll(`[data-head-col="${col}"]`).forEach(el => { el.style.left = leftPx; });
    els.rowsLayer.querySelectorAll(`[data-col="${col}"]`).forEach(el => { el.style.left = leftPx; });
  });
}

function togglePinColumn(col) {
  if (state.pinned.has(col)) state.pinned.delete(col);
  else state.pinned.add(col);
  buildColumnsPanel();
  buildHeader();
  renderViewport();
}

function handleRowsLayerClick(event) {
  const cb = event.target.closest("input[data-select-row]");
  if (cb) {
    const rowIndex = Number(cb.dataset.selectRow);
    const pos = Number(cb.dataset.filteredPos);
    if (event.shiftKey && state.lastSelectedFilteredPos !== null) {
      const lo = Math.min(state.lastSelectedFilteredPos, pos);
      const hi = Math.max(state.lastSelectedFilteredPos, pos);
      for (let p = lo; p <= hi; p++) {
        const idx = state.filteredIndexes[p];
        if (cb.checked) state.selectedRows.add(idx);
        else state.selectedRows.delete(idx);
      }
    } else {
      if (cb.checked) state.selectedRows.add(rowIndex);
      else state.selectedRows.delete(rowIndex);
    }
    state.lastSelectedFilteredPos = pos;
    buildHeader();
    renderViewport();
    updateStats();
    return;
  }

  const rowBtn = event.target.closest("button[data-inspect-row]");
  if (rowBtn) {
    openRowInspector(Number(rowBtn.dataset.inspectRow));
    return;
  }

  const cell = event.target.closest(".grid-cell[data-row][data-col]");
  if (!cell) return;
  showCellDetails(Number(cell.dataset.row), Number(cell.dataset.col));
}

function handleRowsLayerKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  const cell = event.target.closest(".grid-cell[data-row][data-col]");
  if (!cell) return;
  event.preventDefault();
  showCellDetails(Number(cell.dataset.row), Number(cell.dataset.col));
}

function scrollCellIntoView(filteredPos, col) {
  const targetDataTop = Math.max(0, filteredPos * state.rowHeight - state.rowHeight * 2);
  const currentDataTop = physicalToData(els.tableScroll.scrollTop);
  const viewHeight = bodyViewportHeight();
  const rowTop = filteredPos * state.rowHeight;
  if (rowTop < currentDataTop || rowTop + state.rowHeight > currentDataTop + viewHeight) {
    els.tableScroll.scrollTop = dataToPhysical(targetDataTop);
  }

  const cols = visibleColumns();
  const sticky = stickyMeta(cols);
  if (!sticky.offsets.has(col)) {
    let colLeft = ROW_NUM_WIDTH;
    for (const c of cols) {
      if (c === col) break;
      colLeft += state.colWidths[c];
    }
    const colRight = colLeft + state.colWidths[col];
    const visibleLeft = els.tableScroll.scrollLeft + sticky.stickyWidth;
    const visibleRight = els.tableScroll.scrollLeft + els.tableScroll.clientWidth;
    if (colLeft < visibleLeft) {
      els.tableScroll.scrollLeft = Math.max(0, colLeft - sticky.stickyWidth - 12);
    } else if (colRight > visibleRight) {
      els.tableScroll.scrollLeft = Math.max(0, colRight - els.tableScroll.clientWidth + 12);
    }
  }
  renderViewport();
}

// ==================== COLUMN PROFILER (PHASE 3) ====================

function openColumnProfiler(col) {
  state.activeProfileCol = col;
  els.colStatsTitle.textContent = `Column Profile · ${state.headers[col]}`;
  els.colStatsPinBtn.textContent = state.pinned.has(col) ? "Unpin column" : "Pin left";

  const total = state.filteredIndexes.length;
  let nonEmpty = 0;
  const freq = new Map();
  const nums = [];

  for (const idx of state.filteredIndexes) {
    const raw = String(state.rows[idx][col] ?? "");
    const trimmed = raw.trim();
    if (trimmed !== "") {
      nonEmpty++;
      freq.set(trimmed, (freq.get(trimmed) || 0) + 1);
      const n = parseNumeric(trimmed);
      if (n !== null) nums.push(n);
    }
  }

  const empty = total - nonEmpty;
  const uniqueCount = freq.size;
  const topValues = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const maxFreq = topValues.length ? topValues[0][1] : 1;

  els.colStatsBody.innerHTML = "";

  const summary = document.createElement("div");
  summary.className = "stats-grid";
  const cards = [
    ["Filtered rows", total.toLocaleString()],
    ["Non-empty", `${nonEmpty.toLocaleString()} (${total ? Math.round(nonEmpty / total * 100) : 0}%)`],
    ["Empty", `${empty.toLocaleString()} (${total ? Math.round(empty / total * 100) : 0}%)`],
    ["Distinct values", uniqueCount.toLocaleString()]
  ];
  if (nums.length) {
    nums.sort((a, b) => a - b);
    const sum = nums.reduce((a, b) => a + b, 0);
    const mid = Math.floor(nums.length / 2);
    const median = nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
    cards.push(
      ["Min", formatStatNum(nums[0])],
      ["Max", formatStatNum(nums[nums.length - 1])],
      ["Average", formatStatNum(sum / nums.length)],
      ["Median", formatStatNum(median)],
      ["Sum", formatStatNum(sum)]
    );
  }
  cards.forEach(([label, val]) => {
    const card = document.createElement("div");
    card.className = "stat-card";
    const l = document.createElement("div");
    l.className = "stat-card-label";
    l.textContent = label;
    const v = document.createElement("div");
    v.className = "stat-card-value";
    v.textContent = val;
    card.append(l, v);
    summary.appendChild(card);
  });
  els.colStatsBody.appendChild(summary);

  const heading = document.createElement("div");
  heading.className = "modal-hint";
  heading.style.marginTop = "4px";
  heading.textContent = topValues.length
    ? "Top values (click any value to filter this column):"
    : "No non-empty values in filtered rows.";
  els.colStatsBody.appendChild(heading);

  if (topValues.length) {
    const list = document.createElement("div");
    list.className = "freq-list";
    topValues.forEach(([val, count]) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "freq-item";
      const bar = document.createElement("div");
      bar.className = "freq-bar";
      bar.style.width = `${Math.max(2, (count / maxFreq) * 100)}%`;
      const valSpan = document.createElement("span");
      valSpan.className = "freq-val";
      valSpan.textContent = collapsePreview(val);
      valSpan.title = val;
      const cntSpan = document.createElement("span");
      cntSpan.className = "freq-count";
      cntSpan.textContent = `${count.toLocaleString()} (${Math.round(count / Math.max(1, total) * 100)}%)`;
      item.append(bar, valSpan, cntSpan);
      item.addEventListener("click", () => {
        state.filters[col] = `="${val}"`;
        if (!state.showColumnFilters) {
          state.showColumnFilters = true;
          savePreferences();
        }
        els.columnStatsDialog.close();
        applyFilters(true);
      });
      list.appendChild(item);
    });
    els.colStatsBody.appendChild(list);
  }

  if (!els.columnStatsDialog.open) els.columnStatsDialog.showModal();
}

function formatStatNum(n) {
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return Number(n.toFixed(4)).toString();
}

function copyColumnValues(col, uniqueOnly, buttonEl) {
  if (col === null) return;
  const sourceRows = getActiveRowIndexes();
  let values = sourceRows.map(idx => String(state.rows[idx][col] ?? ""));
  if (uniqueOnly) values = Array.from(new Set(values.filter(v => v.trim() !== "")));
  copyWithFeedback(values.join("\n"), buttonEl, uniqueOnly ? "Copy unique" : "Copy values");
}

// ==================== FULL ROW INSPECTOR (PHASE 3) ====================

function openRowInspector(rowIndex) {
  state.currentRowIndex = rowIndex;
  els.rowFieldSearch.value = "";
  renderRowInspectorBody();
  if (!els.rowDialog.open) els.rowDialog.showModal();
}

function stepRowInspector(delta) {
  const pos = state.filteredIndexes.indexOf(state.currentRowIndex);
  if (pos < 0) return;
  const nextPos = pos + delta;
  if (nextPos < 0 || nextPos >= state.filteredIndexes.length) return;
  state.currentRowIndex = state.filteredIndexes[nextPos];
  renderRowInspectorBody();
}

function renderRowInspectorBody() {
  const rowIndex = state.currentRowIndex;
  if (rowIndex === null || !state.rows[rowIndex]) return;
  const row = state.rows[rowIndex];
  const filteredPos = state.filteredIndexes.indexOf(rowIndex);
  els.rowDialogTitle.textContent = `Row ${rowIndex + 1}`;
  els.prevRowBtn.disabled = filteredPos <= 0;
  els.nextRowBtn.disabled = filteredPos < 0 || filteredPos >= state.filteredIndexes.length - 1;

  const query = els.rowFieldSearch.value.trim().toLowerCase();
  const hideEmpty = els.rowHideEmptyCheck.checked;
  const cols = visibleColumns();
  const nonEmptyCount = cols.filter(c => String(row[c] ?? "").trim() !== "").length;

  els.rowDialogMeta.innerHTML = "";
  [
    filteredPos >= 0 ? `Filtered: ${filteredPos + 1} / ${state.filteredIndexes.length.toLocaleString()}` : "Outside filter",
    `Populated: ${nonEmptyCount} / ${cols.length}`
  ].forEach(text => {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = text;
    els.rowDialogMeta.appendChild(pill);
  });

  els.rowKvList.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (const col of cols) {
    const header = state.headers[col];
    const value = String(row[col] ?? "");
    if (hideEmpty && value.trim() === "") continue;
    if (query && !header.toLowerCase().includes(query) && !value.toLowerCase().includes(query)) continue;

    const item = document.createElement("div");
    item.className = "row-kv-item";
    const keyEl = document.createElement("div");
    keyEl.className = "row-kv-key";
    keyEl.textContent = header;

    const valEl = document.createElement("div");
    valEl.className = "row-kv-val" + (value === "" ? " empty" : "");
    valEl.textContent = value === "" ? "(empty)" : value;
    valEl.title = "Click to inspect in full cell popup";
    valEl.addEventListener("click", () => {
      els.rowDialog.close();
      showCellDetails(rowIndex, col);
    });

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn sm ghost";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => copyWithFeedback(value, copyBtn, "Copy"));

    item.append(keyEl, valEl, copyBtn);
    fragment.appendChild(item);
  }
  els.rowKvList.appendChild(fragment);
}

function copyCurrentRow(format, btnEl) {
  const rowIndex = state.currentRowIndex;
  if (rowIndex === null || !state.rows[rowIndex]) return;
  const cols = visibleColumns();
  const row = state.rows[rowIndex];
  let text;
  if (format === "json") {
    const obj = {};
    cols.forEach(col => { obj[state.headers[col]] = row[col] ?? ""; });
    text = JSON.stringify(obj, null, 2);
  } else {
    text = cols.map(col => escapeDelimited(row[col] ?? "", "\t")).join("\t");
  }
  copyWithFeedback(text, btnEl, format === "json" ? "Copy JSON" : "Copy TSV");
}

// ==================== CELL DETAIL POPUP, DECODERS & DIFF (PHASE 4) ====================

function showCellDetails(rowIndex, col) {
  const raw = String(state.rows[rowIndex][col] ?? "");
  state.currentCell = { rowIndex, col };
  state.currentCellText = raw;
  state.currentCellFormats = analyzeCellValue(raw);
  state.cellViewMode = state.currentCellFormats.hasFormatted ? "formatted" : "raw";
  if (!els.cellDialog.open) els.cellSearchInput.value = "";

  const cols = visibleColumns();
  const rowPos = state.filteredIndexes.indexOf(rowIndex);
  const colPos = cols.indexOf(col);
  if (rowPos >= 0) scrollCellIntoView(rowPos, col);

  els.cellTitle.textContent = state.headers[col];
  els.cellTitle.title = state.headers[col];

  els.navLeftBtn.disabled = colPos <= 0;
  els.navRightBtn.disabled = colPos < 0 || colPos >= cols.length - 1;
  els.navUpBtn.disabled = rowPos <= 0;
  els.navDownBtn.disabled = rowPos < 0 || rowPos >= state.filteredIndexes.length - 1;

  els.cellMeta.innerHTML = "";
  const rowPosSuffix = rowPos >= 0 ? ` (${rowPos + 1}/${state.filteredIndexes.length.toLocaleString()})` : "";
  const pills = [
    { text: `Row: ${rowIndex + 1}${rowPosSuffix}` },
    { text: `Col: ${colPos >= 0 ? colPos + 1 : col + 1}/${cols.length}` },
    { text: `${raw.length.toLocaleString()} chars` },
    { text: state.currentCellFormats.label, cls: state.currentCellFormats.hasFormatted ? "accent" : "" }
  ];
  if (state.currentCellFormats.extraPills) {
    pills.push(...state.currentCellFormats.extraPills);
  }
  pills.forEach(({ text, cls }) => {
    const pill = document.createElement("span");
    pill.className = "pill" + (cls ? ` ${cls}` : "");
    pill.textContent = text;
    els.cellMeta.appendChild(pill);
  });

  if (state.diffBaseline) {
    state.diffActive = state.diffBaseline.rowIndex !== rowIndex || state.diffBaseline.col !== col;
  }

  els.cellContent.scrollTop = 0;
  els.cellContent.scrollLeft = 0;
  if (!els.cellDialog.open) els.cellDialog.showModal();
  renderCellContentView();
}

function navigateCellBy(dRow, dCol) {
  if (!state.currentCell) return;
  const cols = visibleColumns();
  const rowPos = state.filteredIndexes.indexOf(state.currentCell.rowIndex);
  const colPos = cols.indexOf(state.currentCell.col);
  if (rowPos < 0 || colPos < 0) return;
  const nextRowPos = rowPos + dRow;
  const nextColPos = colPos + dCol;
  if (nextRowPos < 0 || nextRowPos >= state.filteredIndexes.length || nextColPos < 0 || nextColPos >= cols.length) return;
  showCellDetails(state.filteredIndexes[nextRowPos], cols[nextColPos]);
}

function handleCellNavigation(event) {
  if (!els.cellDialog.open || !state.currentCell || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.target.closest("input, textarea, select, [contenteditable]")) return;
  const directions = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
  const dir = directions[event.key];
  if (!dir) return;
  event.preventDefault();
  navigateCellBy(dir[0], dir[1]);
}

function pinCurrentCellForDiff() {
  if (!state.currentCell) return;
  state.diffBaseline = {
    rowIndex: state.currentCell.rowIndex,
    col: state.currentCell.col,
    label: `${state.headers[state.currentCell.col]} #${state.currentCell.rowIndex + 1}`,
    text: getCurrentCellDisplayText()
  };
  state.diffActive = false;
  renderCellContentView();
  flashButton(els.pinDiffBtn, "Pinned!");
}

function getCurrentCellDisplayText() {
  if (state.cellViewMode === "formatted" && state.currentCellFormats && state.currentCellFormats.hasFormatted) {
    return state.currentCellFormats.formatted;
  }
  return state.currentCellText;
}

function renderCellContentView() {
  const info = state.currentCellFormats || { hasFormatted: false, isJson: false, label: "Plain text" };
  const showingFormatted = state.cellViewMode === "formatted" && info.hasFormatted;
  els.toggleCellFormatBtn.classList.toggle("hidden", !info.hasFormatted);
  els.toggleCellFormatBtn.textContent = showingFormatted ? info.label : "Raw";
  els.toggleCellFormatBtn.classList.toggle("active", showingFormatted);
  els.copyCellFormattedBtn.classList.toggle("hidden", !info.hasFormatted);

  const hasDiff = Boolean(state.diffBaseline);
  els.toggleDiffBtn.classList.toggle("hidden", !hasDiff);
  els.clearDiffBtn.classList.toggle("hidden", !hasDiff);
  els.toggleDiffBtn.classList.toggle("active", hasDiff && state.diffActive);
  if (hasDiff) els.toggleDiffBtn.textContent = `Diff vs ${state.diffBaseline.label}`;

  const text = getCurrentCellDisplayText();
  state.cellSearchMatches = [];
  state.activeCellMatch = -1;

  if (hasDiff && state.diffActive) {
    renderDiffView(state.diffBaseline.text, text);
    updateCellSearchControls();
    return;
  }

  const query = els.cellSearchInput.value;
  if (query) {
    renderCellSearchView(text, query);
  } else if (showingFormatted && info.isJson) {
    renderHighlightedJson(text);
    updateCellSearchControls();
  } else {
    els.cellContent.textContent = text;
    updateCellSearchControls();
  }
}

function renderCellSearchView(text, query) {
  let pattern;
  try {
    const source = state.cellSearchRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pattern = new RegExp(source, state.cellSearchCase ? "g" : "gi");
  } catch (err) {
    els.cellContent.textContent = text;
    els.cellMatchCount.textContent = "Invalid regex";
    els.prevCellMatchBtn.disabled = true;
    els.nextCellMatchBtn.disabled = true;
    return;
  }

  const fragment = document.createDocumentFragment();
  if (state.cellSearchGrep) {
    const lines = text.split("\n");
    let matchedLines = 0;
    lines.forEach((line, idx) => {
      pattern.lastIndex = 0;
      if (!pattern.test(line)) return;
      matchedLines++;
      const row = document.createElement("div");
      row.className = "grep-line";
      const ln = document.createElement("span");
      ln.className = "line-no";
      ln.textContent = String(idx + 1);
      const content = document.createElement("span");
      appendHighlightedMatches(content, line, pattern);
      row.append(ln, content);
      fragment.appendChild(row);
    });
    if (!matchedLines) {
      const empty = document.createElement("div");
      empty.className = "modal-hint";
      empty.textContent = "No lines matched this search.";
      fragment.appendChild(empty);
    }
  } else {
    appendHighlightedMatches(fragment, text, pattern);
  }

  els.cellContent.replaceChildren(fragment);
  stepCellMatch(1);
}

function appendHighlightedMatches(container, text, pattern) {
  pattern.lastIndex = 0;
  let lastIndex = 0;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    if (m[0].length === 0) { pattern.lastIndex++; continue; }
    if (m.index > lastIndex) container.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
    const mark = document.createElement("mark");
    mark.className = "cell-search-match";
    mark.textContent = m[0];
    state.cellSearchMatches.push(mark);
    container.appendChild(mark);
    lastIndex = m.index + m[0].length;
  }
  container.appendChild(document.createTextNode(text.slice(lastIndex)));
}

function stepCellMatch(direction) {
  const matches = state.cellSearchMatches;
  const previous = matches[state.activeCellMatch];
  if (previous) previous.classList.remove("active");
  if (matches.length) {
    state.activeCellMatch = (state.activeCellMatch + direction + matches.length) % matches.length;
    const active = matches[state.activeCellMatch];
    active.classList.add("active");
    active.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  updateCellSearchControls();
}

function updateCellSearchControls() {
  const count = state.cellSearchMatches.length;
  els.cellMatchCount.textContent = count ? `${state.activeCellMatch + 1} / ${count}` : "0 matches";
  els.prevCellMatchBtn.disabled = !count;
  els.nextCellMatchBtn.disabled = !count;
}

function analyzeCellValue(raw) {
  const text = String(raw ?? "").trim();
  const extraPills = [];

  // Unix epoch timestamp check (seconds or ms between 1990 and 2100)
  if (/^\d{10}$/.test(text) || /^\d{13}$/.test(text)) {
    const ms = text.length === 10 ? Number(text) * 1000 : Number(text);
    if (ms >= 631152000000 && ms <= 4102444800000) {
      const d = new Date(ms);
      extraPills.push({ text: `UTC: ${d.toISOString().replace("T", " ").replace(".000Z", "Z")}`, cls: "accent" });
    }
  }

  if (!text) return { hasFormatted: false, isJson: false, label: "Empty", formatted: "", extraPills };

  // 1. Plain JSON object/array
  if (text[0] === "{" || text[0] === "[") {
    try {
      const parsed = JSON.parse(text);
      return { hasFormatted: true, isJson: true, label: "JSON", formatted: JSON.stringify(parsed, null, 2), extraPills };
    } catch (_) {}
  }

  // 2. Double-encoded / escaped JSON string
  if ((text.startsWith('"') && text.endsWith('"')) || (text.includes('\\"') && (text[0] === "{" || text[0] === "[" || text.startsWith("\\{") || text.startsWith("\\[")))) {
    try {
      const first = text.startsWith('"') ? JSON.parse(text) : text.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      if (typeof first === "string") {
        const firstTrim = first.trim();
        if (firstTrim[0] === "{" || firstTrim[0] === "[") {
          const inner = JSON.parse(firstTrim);
          return { hasFormatted: true, isJson: true, label: "Unescaped JSON", formatted: JSON.stringify(inner, null, 2), extraPills };
        }
      }
    } catch (_) {}
  }

  // 3. JWT token
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(text)) {
    try {
      const [h, p, sig] = text.split(".");
      const header = JSON.parse(decodeBase64Url(h));
      const payload = JSON.parse(decodeBase64Url(p));
      if (header && typeof header === "object" && payload && typeof payload === "object") {
        if (typeof payload.exp === "number") {
          const expDate = new Date(payload.exp * 1000);
          const expired = expDate.getTime() < Date.now();
          extraPills.push({ text: `${expired ? "Expired" : "Expires"}: ${expDate.toISOString().slice(0, 19).replace("T", " ")}Z`, cls: expired ? "bad" : "ok" });
        }
        return {
          hasFormatted: true,
          isJson: true,
          label: "JWT",
          formatted: JSON.stringify({ header, payload, signature: sig || "(none)" }, null, 2),
          extraPills
        };
      }
    } catch (_) {}
  }

  // 4. XML / HTML
  if (text.startsWith("<") && text.endsWith(">") && /^<[a-zA-Z?!]/.test(text)) {
    return { hasFormatted: true, isJson: false, label: "XML / HTML", formatted: formatXml(text), extraPills };
  }

  // 5. URL with query parameters
  if (/^https?:\/\/[^\s]+\?[^\s]+$/i.test(text)) {
    try {
      const url = new URL(text);
      const params = {};
      for (const [k, v] of url.searchParams.entries()) {
        if (k in params) params[k] = Array.isArray(params[k]) ? [...params[k], v] : [params[k], v];
        else params[k] = v;
      }
      return {
        hasFormatted: true,
        isJson: true,
        label: "URL Params",
        formatted: JSON.stringify({ origin: url.origin, pathname: url.pathname, params, hash: url.hash || undefined }, null, 2),
        extraPills
      };
    } catch (_) {}
  }

  // 6. Base64 printable UTF-8
  if (text.length >= 12 && text.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
    try {
      const decoded = decodeBase64Utf8(text);
      if (decoded && /^[\t\r\n\x20-\x7E\u00A0-\uFFFF]+$/.test(decoded) && decoded !== text) {
        const innerTrim = decoded.trim();
        if (innerTrim[0] === "{" || innerTrim[0] === "[") {
          try {
            return { hasFormatted: true, isJson: true, label: "Base64 → JSON", formatted: JSON.stringify(JSON.parse(innerTrim), null, 2), extraPills };
          } catch (_) {}
        }
        return { hasFormatted: true, isJson: false, label: "Base64", formatted: decoded, extraPills };
      }
    } catch (_) {}
  }

  return { hasFormatted: false, isJson: false, label: "Plain text", formatted: raw, extraPills };
}

function decodeBase64Url(part) {
  let b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return decodeBase64Utf8(b64);
}

function decodeBase64Utf8(b64) {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function formatXml(xml) {
  const normalized = xml.replace(/(>)(<)(\/*)/g, "$1\n$2$3");
  const lines = normalized.split("\n");
  let indent = 0;
  return lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return "";
    if (/^<\/\w/.test(trimmed)) indent = Math.max(0, indent - 1);
    const padded = "  ".repeat(indent) + trimmed;
    if (/^<\w[^>]*[^\/]>$/.test(trimmed) && !/^<\w[^>]*>.*<\/\w+>$/.test(trimmed)) indent++;
    return padded;
  }).filter(Boolean).join("\n");
}

function renderHighlightedJson(jsonText) {
  if (jsonText.length > 250000) {
    els.cellContent.textContent = jsonText;
    return;
  }
  const tokenRe = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;
  const frag = document.createDocumentFragment();
  let last = 0;
  let m;
  while ((m = tokenRe.exec(jsonText)) !== null) {
    if (m.index > last) frag.appendChild(document.createTextNode(jsonText.slice(last, m.index)));
    const tok = m[0];
    const span = document.createElement("span");
    if (tok.startsWith('"')) {
      if (m[2]) {
        const keyEnd = tok.lastIndexOf('"') + 1;
        span.className = "tok-key";
        span.textContent = tok.slice(0, keyEnd);
        frag.appendChild(span);
        frag.appendChild(document.createTextNode(tok.slice(keyEnd)));
        last = tokenRe.lastIndex;
        continue;
      }
      span.className = "tok-str";
    } else if (tok === "true" || tok === "false") {
      span.className = "tok-bool";
    } else if (tok === "null") {
      span.className = "tok-null";
    } else {
      span.className = "tok-num";
    }
    span.textContent = tok;
    frag.appendChild(span);
    last = tokenRe.lastIndex;
  }
  if (last < jsonText.length) frag.appendChild(document.createTextNode(jsonText.slice(last)));
  els.cellContent.replaceChildren(frag);
}

function computeLineDiff(baseText, currText) {
  const a = baseText.split("\n");
  const b = currText.split("\n");
  if (a.length * b.length > 600000) {
    const maxLen = Math.max(a.length, b.length);
    const out = [];
    for (let i = 0; i < maxLen; i++) {
      if (a[i] === b[i]) out.push({ type: "ctx", text: a[i] ?? "" });
      else {
        if (i < a.length) out.push({ type: "del", text: a[i] });
        if (i < b.length) out.push({ type: "add", text: b[i] });
      }
    }
    return out;
  }

  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: "ctx", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "del", text: a[i++] }); }
    else { out.push({ type: "add", text: b[j++] }); }
  }
  while (i < n) out.push({ type: "del", text: a[i++] });
  while (j < m) out.push({ type: "add", text: b[j++] });
  return out;
}

function renderDiffView(baseText, currText) {
  const ops = computeLineDiff(baseText, currText);
  const frag = document.createDocumentFragment();
  const header = document.createElement("div");
  header.className = "modal-hint";
  header.style.marginBottom = "8px";
  const adds = ops.filter(o => o.type === "add").length;
  const dels = ops.filter(o => o.type === "del").length;
  header.textContent = `Comparing against ${state.diffBaseline.label} · +${adds} added, -${dels} removed`;
  frag.appendChild(header);

  ops.forEach(op => {
    const line = document.createElement("div");
    line.className = `diff-line diff-${op.type}`;
    const sign = document.createElement("span");
    sign.className = "diff-sign";
    sign.textContent = op.type === "add" ? "+" : op.type === "del" ? "-" : " ";
    const text = document.createElement("span");
    text.textContent = op.text;
    line.append(sign, text);
    frag.appendChild(line);
  });
  els.cellContent.replaceChildren(frag);
}

// ==================== COLUMNS SIDEBAR (DRAG REORDER + PIN) ====================

function buildColumnsPanel() {
  const query = els.columnSearch.value.trim().toLowerCase();
  els.columnsList.innerHTML = "";
  let draggedCol = null;

  state.colOrder.forEach((col, orderIdx) => {
    const header = state.headers[col];
    if (query && !header.toLowerCase().includes(query)) return;

    const row = document.createElement("div");
    row.className = "column-item";
    row.draggable = true;
    row.dataset.col = String(col);

    row.addEventListener("dragstart", () => {
      draggedCol = col;
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      draggedCol = null;
      els.columnsList.querySelectorAll(".column-item").forEach(el => el.classList.remove("dragging", "drag-over"));
    });
    row.addEventListener("dragover", event => {
      event.preventDefault();
      if (draggedCol !== null && draggedCol !== col) row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", event => {
      event.preventDefault();
      row.classList.remove("drag-over");
      if (draggedCol === null || draggedCol === col) return;
      const from = state.colOrder.indexOf(draggedCol);
      const to = state.colOrder.indexOf(col);
      if (from < 0 || to < 0) return;
      state.colOrder.splice(from, 1);
      state.colOrder.splice(to, 0, draggedCol);
      buildColumnsPanel();
      buildHeader();
      renderViewport();
    });

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "⋮⋮";
    handle.title = "Drag to reorder";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.visible[col];
    checkbox.addEventListener("change", () => {
      state.visible[col] = checkbox.checked;
      ensureAtLeastOneColumn();
      buildColumnsPanel();
      applyFilters(false);
    });

    const name = document.createElement("span");
    name.className = "column-name";
    name.textContent = header;
    name.title = header;
    name.addEventListener("click", () => {
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event("change"));
    });

    const actions = document.createElement("div");
    actions.className = "column-item-actions";

    const pinBtn = document.createElement("button");
    pinBtn.type = "button";
    pinBtn.className = "mini-icon-btn" + (state.pinned.has(col) ? " active" : "");
    pinBtn.textContent = "📌";
    pinBtn.title = state.pinned.has(col) ? "Unpin column" : "Pin column to left";
    pinBtn.addEventListener("click", () => togglePinColumn(col));

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "mini-icon-btn";
    upBtn.textContent = "↑";
    upBtn.title = "Move column left";
    upBtn.disabled = orderIdx === 0;
    upBtn.addEventListener("click", () => moveColumnOrder(orderIdx, -1));

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "mini-icon-btn";
    downBtn.textContent = "↓";
    downBtn.title = "Move column right";
    downBtn.disabled = orderIdx === state.colOrder.length - 1;
    downBtn.addEventListener("click", () => moveColumnOrder(orderIdx, 1));

    actions.append(pinBtn, upBtn, downBtn);
    row.append(handle, checkbox, name, actions);
    els.columnsList.appendChild(row);
  });
}

function moveColumnOrder(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.colOrder.length) return;
  [state.colOrder[index], state.colOrder[target]] = [state.colOrder[target], state.colOrder[index]];
  buildColumnsPanel();
  buildHeader();
  renderViewport();
}

function resetColumnLayout() {
  if (!state.headers.length) return;
  state.colOrder = state.headers.map((_, col) => col);
  state.pinned = new Set();
  state.colWidths = state.headers.map((h, col) => suggestColumnWidth(h, state.rows, col));
  state.visible = state.headers.map(() => true);
  buildColumnsPanel();
  applyFilters(false);
  showMessage("Column layout reset.", "info");
}

function ensureAtLeastOneColumn() {
  if (state.visible.some(Boolean)) return;
  state.visible[state.colOrder[0] ?? 0] = true;
  showMessage("At least one column must remain visible.", "info");
}

function showAllColumns() {
  state.visible = state.visible.map(() => true);
  buildColumnsPanel();
  applyFilters(false);
}

function hideEmptyColumns() {
  state.visible = state.headers.map((_, col) => state.rows.some(row => String(row[col] ?? "").trim() !== ""));
  ensureAtLeastOneColumn();
  buildColumnsPanel();
  applyFilters(false);
}

function toggleColumnFilters() {
  state.showColumnFilters = !state.showColumnFilters;
  updateFilterBadges();
  savePreferences();
  buildHeader();
  renderViewport();
}

function toggleDedupe() {
  state.dedupe = !state.dedupe;
  els.dedupeBtn.classList.toggle("active", state.dedupe);
  applyFilters(true);
}

function toggleColumnsPanel() {
  els.main.classList.toggle("columns-open");
  els.columnsBtn.classList.toggle("active", els.main.classList.contains("columns-open"));
  setTimeout(renderViewport, 200);
}

function toggleWrap() {
  state.wrap = !state.wrap;
  state.rowHeight = state.wrap ? state.wrapRowHeight : state.normalRowHeight;
  document.documentElement.style.setProperty("--row-height", `${state.rowHeight}px`);
  els.gridCanvas.classList.toggle("wrap", state.wrap);
  els.wrapBtn.classList.toggle("active", state.wrap);
  savePreferences();
  buildHeader();
  renderViewport();
}

// ==================== 2D FIND (PHASE 2) ====================

function rebuildFindMatches(resetActive) {
  const query = els.findInput.value.trim().toLowerCase();
  const cols = visibleColumns();
  const matches = [];
  if (query) {
    for (let pos = 0; pos < state.filteredIndexes.length; pos++) {
      const actualIndex = state.filteredIndexes[pos];
      const row = state.rows[actualIndex];
      for (const col of cols) {
        if (String(row[col] ?? "").toLowerCase().includes(query)) matches.push({ filteredPos: pos, col });
      }
    }
  }
  state.findMatches = matches;
  if (resetActive) state.activeFind = matches.length ? 0 : -1;
  else if (state.activeFind >= matches.length) state.activeFind = matches.length ? 0 : -1;
  updateFindCount();
  if (resetActive && matches.length) scrollToFind();
  else renderViewport();
}

function stepFind(direction) {
  if (!state.findMatches.length) {
    rebuildFindMatches(true);
    if (!state.findMatches.length) return;
  }
  state.activeFind = (state.activeFind + direction + state.findMatches.length) % state.findMatches.length;
  updateFindCount();
  scrollToFind();
}

function scrollToFind() {
  const match = state.findMatches[state.activeFind];
  if (!match) return;
  scrollCellIntoView(match.filteredPos, match.col);
}

function updateFindCount() {
  if (!state.findMatches.length) {
    els.findCount.textContent = "0 matches";
    return;
  }
  els.findCount.textContent = `${state.activeFind + 1} / ${state.findMatches.length.toLocaleString()}`;
}

// ==================== STATS BAR ====================

function updateStats() {
  els.stats.innerHTML = "";
  if (!state.rows.length) return;

  const visCols = visibleColumns().length;
  const addPill = (text, cls = "") => {
    const pill = document.createElement("span");
    pill.className = "pill" + (cls ? ` ${cls}` : "");
    pill.textContent = text;
    els.stats.appendChild(pill);
  };

  const filteredCount = state.filteredIndexes.length;
  const totalCount = state.rows.length;
  addPill(filteredCount === totalCount
    ? `${totalCount.toLocaleString()} rows`
    : `${filteredCount.toLocaleString()} / ${totalCount.toLocaleString()} rows`,
    filteredCount !== totalCount ? "accent" : "");
  addPill(visCols === state.headers.length
    ? `${visCols} columns`
    : `${visCols} / ${state.headers.length} columns`);

  if (state.pinned.size) addPill(`${state.pinned.size} pinned`, "accent");
  if (state.dedupe) addPill(`${state.duplicateCount.toLocaleString()} duplicates hidden`, "warn");
  if (state.sorts.length) {
    const desc = state.sorts.map(s => `${state.headers[s.col]} ${s.dir === "asc" ? "↑" : "↓"}`).join(", ");
    addPill(`Sort: ${desc}`);
  }

  if (state.selectedRows.size) {
    addPill(`${state.selectedRows.size.toLocaleString()} selected`, "accent");
    const clearSelBtn = document.createElement("button");
    clearSelBtn.type = "button";
    clearSelBtn.className = "btn sm ghost";
    clearSelBtn.textContent = "Clear selection";
    clearSelBtn.addEventListener("click", () => {
      state.selectedRows.clear();
      buildHeader();
      renderViewport();
      updateStats();
    });
    els.stats.appendChild(clearSelBtn);
  }

  const hasActiveFilters = els.globalFilter.value.trim() !== "" || countActiveColumnFilters() > 0 || state.dedupe;
  if (hasActiveFilters) {
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "btn sm";
    resetBtn.textContent = "Reset filters";
    resetBtn.addEventListener("click", resetAllFilters);
    els.stats.appendChild(resetBtn);
  }
}

// ==================== EXPORT & COPY (PHASE 5) ====================

function getActiveRowIndexes() {
  if (state.selectedRows.size) {
    return state.filteredIndexes.filter(idx => state.selectedRows.has(idx));
  }
  return state.filteredIndexes;
}

function getExportRows() {
  const cols = visibleColumns();
  const header = cols.map(col => state.headers[col]);
  const rowIndexes = getActiveRowIndexes();
  const rows = rowIndexes.map(index => cols.map(col => state.rows[index][col] ?? ""));
  return { header, rows, selectedOnly: state.selectedRows.size > 0 };
}

async function handleExportAction(event) {
  const btn = event.target.closest("[data-export]");
  if (!btn) return;
  els.exportDropdown.classList.remove("open");
  els.exportMenuBtn.setAttribute("aria-expanded", "false");

  if (!state.rows.length) {
    showMessage("No table data to export.", "error");
    return;
  }

  const action = btn.dataset.export;
  const { header, rows, selectedOnly } = getExportRows();
  const scopeLabel = selectedOnly ? `${rows.length.toLocaleString()} selected rows` : `${rows.length.toLocaleString()} filtered rows`;

  if (action === "copy-tsv") {
    await copyText(rowsToDelimited([header, ...rows], "\t"));
    showMessage(`Copied ${scopeLabel} as TSV.`, "success");
  } else if (action === "copy-json") {
    await copyText(rowsToJson(header, rows));
    showMessage(`Copied ${scopeLabel} as JSON.`, "success");
  } else if (action === "copy-md") {
    await copyText(rowsToMarkdown(header, rows));
    showMessage(`Copied ${scopeLabel} as Markdown table.`, "success");
  } else if (action === "dl-csv") {
    downloadFile(rowsToDelimited([header, ...rows], ","), "table-export.csv", "text/csv;charset=utf-8");
    showMessage(`Exported ${scopeLabel} as CSV.`, "success");
  } else if (action === "dl-tsv") {
    downloadFile(rowsToDelimited([header, ...rows], "\t"), "table-export.tsv", "text/tab-separated-values;charset=utf-8");
    showMessage(`Exported ${scopeLabel} as TSV.`, "success");
  } else if (action === "dl-json") {
    downloadFile(rowsToJson(header, rows), "table-export.json", "application/json;charset=utf-8");
    showMessage(`Exported ${scopeLabel} as JSON.`, "success");
  } else if (action === "dl-md") {
    downloadFile(rowsToMarkdown(header, rows), "table-export.md", "text/markdown;charset=utf-8");
    showMessage(`Exported ${scopeLabel} as Markdown.`, "success");
  } else if (action === "dl-html") {
    downloadFile(rowsToHtml(header, rows), "table-export.html", "text/html;charset=utf-8");
    showMessage(`Exported ${scopeLabel} as HTML.`, "success");
  }
}

function rowsToDelimited(rows, delimiter) {
  return rows.map(row => row.map(value => escapeDelimited(value, delimiter)).join(delimiter)).join("\n");
}

function escapeDelimited(value, delimiter) {
  const text = String(value ?? "");
  if (delimiter === "\t") return text.replace(/\t/g, " ").replace(/\r?\n/g, " ");
  if (/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

function rowsToJson(header, rows) {
  const objs = rows.map(row => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = row[i] ?? ""; });
    return obj;
  });
  return JSON.stringify(objs, null, 2);
}

function rowsToMarkdown(header, rows) {
  const esc = v => collapsePreview(v).replace(/\|/g, "\\|");
  const lines = [
    `| ${header.map(esc).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map(r => `| ${r.map(esc).join(" | ")} |`)
  ];
  return lines.join("\n");
}

function rowsToHtml(header, rows) {
  const esc = v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const ths = header.map(h => "<th>" + esc(h) + "</th>").join("");
  const trs = rows.map(r => {
    const tds = r.map(c => "<td>" + esc(c) + "</td>").join("");
    return "<tr>" + tds + "</tr>";
  }).join("\n  ");
  return "<table>\n  <thead><tr>" + ths + "</tr></thead>\n  <tbody>\n  " + trs + "\n  </tbody>\n</table>";
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copyWithFeedback(text, buttonEl, defaultLabel) {
  await copyText(text);
  flashButton(buttonEl, "Copied!", defaultLabel);
}

function flashButton(buttonEl, label, restoreLabel) {
  const original = restoreLabel || buttonEl.dataset.origLabel || buttonEl.textContent;
  buttonEl.dataset.origLabel = original;
  buttonEl.textContent = label;
  buttonEl.classList.add("success");
  clearTimeout(buttonEl._flashTimer);
  buttonEl._flashTimer = setTimeout(() => {
    buttonEl.textContent = original;
    buttonEl.classList.remove("success");
  }, 1400);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

// ==================== FILE LOADING, SAMPLE DATA & UNDO CLEAR ====================

function loadFile() {
  const file = els.fileInput.files && els.fileInput.files[0];
  if (!file) return;
  readAndRenderFile(file);
}

function readAndRenderFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    els.tableInput.value = String(reader.result || "");
    renderFromInput();
  };
  reader.onerror = () => showMessage("Could not read the selected file.", "error");
  reader.readAsText(file);
}

function loadSampleData() {
  const sampleJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfMTAxIiwicm9sZSI6ImFkbWluIiwiZXhwIjoxODkzNDU2MDAwfQ.signature_demo";
  const sample = [
    {
      id: "EVT-1001",
      service: "checkout-api",
      status: 200,
      latency_ms: 42,
      timestamp: "1763549400",
      payload: JSON.stringify({ orderId: "ORD-8821", total: 149.5, currency: "USD", items: [{ sku: "KB-01", qty: 1 }, { sku: "MS-04", qty: 2 }] }),
      details: "https://api.example.com/v2/orders?region=ap-south&expand=items&retry=0",
      notes: "Line 1: Payment authorized\nLine 2: Inventory reserved\nLine 3: Receipt queued"
    },
    {
      id: "EVT-1002",
      service: "auth-gateway",
      status: 401,
      latency_ms: 118,
      timestamp: "1763549465",
      payload: JSON.stringify(JSON.stringify({ error: "token_invalid", reason: "scope mismatch", scopes: ["read:orders", "write:orders"] })),
      details: sampleJwt,
      notes: "Double-encoded JSON in payload, JWT in details"
    },
    {
      id: "EVT-1003",
      service: "billing-worker",
      status: 500,
      latency_ms: 1420,
      timestamp: "1763549520",
      payload: "<invoice id=\"INV-902\"><customer>Acme Corp</customer><amount currency=\"USD\">420.00</amount><status>FAILED</status></invoice>",
      details: btoa(JSON.stringify({ retryAttempt: 3, queue: "billing-dlq", region: "us-east-1" })),
      notes: "Error: Gateway timeout\n  at chargeCard (billing.js:142)\n  at processBatch (worker.js:58)"
    },
    {
      id: "EVT-1004",
      service: "checkout-api",
      status: 200,
      latency_ms: 37,
      timestamp: "1763549580",
      payload: JSON.stringify({ orderId: "ORD-8822", total: 89.0, currency: "USD", items: [{ sku: "KB-01", qty: 1 }] }),
      details: "",
      notes: ""
    },
    {
      id: "EVT-1004",
      service: "checkout-api",
      status: 200,
      latency_ms: 37,
      timestamp: "1763549580",
      payload: JSON.stringify({ orderId: "ORD-8822", total: 89.0, currency: "USD", items: [{ sku: "KB-01", qty: 1 }] }),
      details: "",
      notes: ""
    },
    {
      id: "EVT-1005",
      service: "search-indexer",
      status: 200,
      latency_ms: 215,
      timestamp: "1763549640",
      payload: JSON.stringify({ indexedDocs: 12450, skipped: 3, durationSec: 0.215 }),
      details: "https://search.example.com/reindex?batch=44&force=true",
      notes: "Nightly sync completed cleanly"
    }
  ];
  els.tableInput.value = JSON.stringify(sample, null, 2);
  renderFromInput();
}

function clearAll() {
  const hadData = state.rows.length > 0 || els.tableInput.value.trim() !== "";
  if (hadData) {
    state.undoSnapshot = {
      rawInput: els.tableInput.value,
      delimiter: els.delimiterSelect.value,
      firstRowHeader: els.firstRowHeaderCheck.checked
    };
  }
  els.tableInput.value = "";
  els.fileInput.value = "";
  els.globalFilter.value = "";
  els.findInput.value = "";
  state.tables = [];
  state.headers = [];
  state.rows = [];
  state.colOrder = [];
  state.pinned = new Set();
  state.filteredIndexes = [];
  state.selectedRows = new Set();
  state.visible = [];
  state.filters = {};
  state.sorts = [];
  state.findMatches = [];
  state.activeFind = -1;
  state.currentCell = null;
  els.gridHeader.innerHTML = "";
  els.rowsLayer.innerHTML = "";
  els.columnsList.innerHTML = "";
  els.emptyState.classList.remove("hidden");
  els.tableScroll.classList.add("hidden");
  els.tableSelect.classList.add("hidden");
  setInputPanelCollapsed(false);
  updateFilterBadges();
  updateFindCount();
  updateStats();

  if (hadData) {
    showMessage("Table cleared.", "info", {
      actionLabel: "Undo",
      onAction: () => {
        if (!state.undoSnapshot) return;
        els.tableInput.value = state.undoSnapshot.rawInput;
        els.delimiterSelect.value = state.undoSnapshot.delimiter;
        els.firstRowHeaderCheck.checked = state.undoSnapshot.firstRowHeader;
        state.undoSnapshot = null;
        renderFromInput();
      }
    });
  }
}

function toggleTheme() {
  const next = document.body.dataset.theme === "dark" ? "light" : "dark";
  document.body.dataset.theme = next;
  els.themeBtn.textContent = next === "dark" ? "Light" : "Dark";
  savePreferences();
}

function showMessage(text, type = "info", action = null) {
  els.message.innerHTML = "";
  const span = document.createElement("span");
  span.textContent = text;
  els.message.appendChild(span);

  if (action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn sm";
    btn.textContent = action.actionLabel;
    btn.addEventListener("click", () => {
      els.message.className = "message";
      action.onAction();
    });
    els.message.appendChild(btn);
  }

  els.message.className = `message show ${type}`;
  clearTimeout(state.debounceTimers._msg);
  if (type === "success" || action) {
    state.debounceTimers._msg = setTimeout(() => {
      els.message.className = "message";
    }, action ? 10000 : 3500);
  }
}

function debounce(key, fn, delay) {
  clearTimeout(state.debounceTimers[key]);
  state.debounceTimers[key] = setTimeout(fn, delay);
}
