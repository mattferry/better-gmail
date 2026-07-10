(function () {
  'use strict';

  // Table inserter — adds a table toolkit to Gmail's compose toolbar: a grid
  // picker to insert a table, row/column insert/delete, Google-palette cell and
  // gridline colors, sizing controls, snapshot undo/redo, and a smart paste that
  // spreads tab-separated (spreadsheet) data across cells.
  //
  // Ported from Mehul S.'s "Gmail Table Inserter" v1.1 nearly verbatim —
  // the inserted table keeps his `gmail-custom-table` class so tables made with
  // the original standalone extension stay editable here. Wrapped in the
  // Better Gmail feature contract: bind-once document listeners gated on a live
  // `enabled` flag, and a managed inject-interval so the toolbar controls can be
  // torn down when the feature is toggled off.

  let enabled = false;
  let bound = false;
  let injectTimer = null;

  let activeGmailCell = null;
  let lastSelectedCells = [];

  // ---- Snapshot history (undo/redo) ----
  let customUndoStack = [];
  let customRedoStack = [];

  function S() { return window.__OB.gmail.SELECTORS; }
  function toast(msg) { window.__OB.ui.toast(msg); }

  function removeAllPopups() {
    document.querySelectorAll('.table-designer-popup, .grid-matrix-popup, .action-dropdown-popup').forEach(el => el.remove());
  }

  function commitSnapshot(target, type = 'table') {
    if (!target) return;
    if (customUndoStack.length >= 25) customUndoStack.shift();

    if (type === 'draftGlobal') {
      customUndoStack.push({ type: 'draftGlobal', containerRef: target, html: target.innerHTML });
    } else {
      customUndoStack.push({ type: 'tableInline', tableRef: target, html: target.innerHTML, style: target.style.cssText });
    }
    customRedoStack = [];
  }

  function getActiveScopeCells(table, scope) {
    if (!table || !activeGmailCell) return [];
    if (scope === 'selection') return lastSelectedCells.length > 0 ? lastSelectedCells : [activeGmailCell];
    if (scope === 'row') return activeGmailCell.parentElement ? Array.from(activeGmailCell.parentElement.children) : [];
    if (scope === 'col') {
      const idx = activeGmailCell.cellIndex;
      const cells = [];
      table.querySelectorAll('tr').forEach(r => { if (r.children[idx]) cells.push(r.children[idx]); });
      return cells;
    }
    return [];
  }

  // ---- Native Google palette ----
  const googlePaletteColors = [
    ['#000000', '#434343', '#666666', '#999999', '#cccccc', '#efefef', '#f3f3f3', '#ffffff'],
    ['#990000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
    ['#e6b8af', '#f4ccd6', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#f4dcd6'],
    ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
    ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9ee1', '#6fa8dc', '#8e7cc3', '#c27ba0'],
    ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
    ['#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47'],
    ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130']
  ];

  function generatePaletteHtml(typeKey) {
    let html = '';
    googlePaletteColors.forEach((row, rIdx) => {
      html += `<div style="display: flex; gap: 3px; margin-bottom: 3px;">`;
      row.forEach(color => {
        const isWhite = color === '#ffffff';
        html += `<div data-color="${color}" data-type="${typeKey}" style="background:${color}; width:13px; height:14px; border-radius:2px; cursor:pointer; border:${isWhite ? '1px solid #dadce0' : 'none'};" title="${color}"></div>`;
      });
      html += `</div>`;
      if (rIdx === 1) html += `<div style="height: 4px;"></div>`;
    });
    return html;
  }

  function createIconButton(icon, tooltipText) {
    const btn = document.createElement('div');
    btn.innerText = icon;
    btn.title = tooltipText;
    btn.style.cssText = 'cursor:pointer; font-size:12px; background:#f1f3f4; padding: 4px 6px; border-radius:4px; user-select:none; height:14px; display:inline-flex; align-items:center; border:1px solid #dadce0; font-weight:bold; box-sizing:content-box;';

    btn.addEventListener('mouseover', () => { btn.style.background = '#e8f0fe'; btn.style.borderColor = '#1a73e8'; });
    btn.addEventListener('mouseout', () => { btn.style.background = '#f1f3f4'; btn.style.borderColor = '#dadce0'; });
    return btn;
  }

  function buildNewGridTable(rowCount, colCount, editableContainer) {
    if (!editableContainer) return;
    editableContainer.focus();
    commitSnapshot(editableContainer, 'draftGlobal');

    let tableHtml = `<table class="gmail-custom-table" style="border-collapse:collapse; width:100%; max-width:750px; border:1px solid #dadce0; font-family:sans-serif; margin:10px 0;">`;
    tableHtml += `<colgroup>`;
    for (let c = 0; c < colCount; c++) { tableHtml += `<col style="width: 120px;">`; }
    tableHtml += `</colgroup><tbody>`;

    for (let r = 1; r <= rowCount; r++) {
      tableHtml += `<tr>`;
      for (let c = 1; c <= colCount; c++) {
        if (r === 1) {
          tableHtml += `<td style="padding:8px; border:1px solid #dadce0; font-weight:bold; text-align:center; background-color:#f8f9fa; width:120px; word-break:break-all;">Header</td>`;
        } else {
          tableHtml += `<td style="padding:8px; border:1px solid #dadce0; text-align:left; vertical-align:top; width:120px; word-break:break-all;">&nbsp;</td>`;
        }
      }
      tableHtml += `</tr>`;
    }
    tableHtml += `</tbody></table><br>`;

    const parser = new DOMParser();
    const tableElement = parser.parseFromString(tableHtml, 'text/html').body.firstChild;

    const selection = window.getSelection();
    if (selection.rangeCount > 0 && editableContainer.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(tableElement);
    } else {
      editableContainer.appendChild(tableElement);
    }
  }

  function spawnCustomPopupList(triggerButton, items, onClickItem) {
    if (!activeGmailCell) { toast('Click inside a table cell first'); return; }
    removeAllPopups();

    const rect = triggerButton.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.className = 'action-dropdown-popup';
    popup.style.cssText = `position:fixed; top:${rect.top - (items.length * 28 + 15)}px; left:${rect.left}px; background:#fff; border:1px solid #dadce0; box-shadow:0px 4px 12px rgba(0,0,0,0.15); border-radius:6px; padding:4px; z-index:100000; display:flex; flex-direction:column; gap:2px;`;

    items.forEach(item => {
      const rowItem = document.createElement('div');
      rowItem.innerText = item.text;
      rowItem.style.cssText = 'padding:6px 12px; font-size:11px; font-weight:500; color:#3c4043; cursor:pointer; border-radius:4px; white-space:nowrap; text-align:left; font-family:sans-serif;';
      rowItem.addEventListener('mouseover', () => rowItem.style.background = '#f1f3f4');
      rowItem.addEventListener('mouseout', () => rowItem.style.background = 'transparent');
      rowItem.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        onClickItem(item.value);
        popup.remove();
      });
      popup.appendChild(rowItem);
    });
    document.body.appendChild(popup);
  }

  function injectTableControls() {
    const toolbars = document.querySelectorAll(S().composeToolbar);

    toolbars.forEach(toolbar => {
      if (toolbar.querySelector('.ob-table-controls')) return;

      const container = document.createElement('div');
      container.className = 'ob-table-controls';
      container.style.cssText = 'display: inline-flex; align-items: center; margin-left: 6px; gap: 4px;';

      const btnTable = createIconButton('📊', 'Grid Generator Matrix');
      const btnUndo = createIconButton('↩️', 'Undo Change');
      const btnRedo = createIconButton('↪️', 'Redo Change');
      const btnInsert = createIconButton('➕', 'Insert Rows / Columns');
      const btnTheme = createIconButton('🎨', 'Format Themes & Colors');
      const btnSize = createIconButton('📐', 'Adjust Dimensions & Widths');
      const btnDelete = createIconButton('❌', 'Delete Elements & Clear Data');

      btnTheme.style.background = '#fef7e0';
      btnTheme.style.borderColor = '#f6cea2';
      btnTheme.addEventListener('mouseout', () => { btnTheme.style.background = '#fef7e0'; btnTheme.style.borderColor = '#f6cea2'; });

      btnTable.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const composeWindow = toolbar.closest('.M9') || toolbar.closest('.dw') || document.body;
        const editable = composeWindow.querySelector('div[contenteditable="true"]');
        if (!editable) return;

        removeAllPopups();
        const rect = btnTable.getBoundingClientRect();
        const popup = document.createElement('div');
        popup.className = 'grid-matrix-popup';
        popup.style.cssText = `position:fixed; top:${rect.top - 195}px; left:${rect.left}px; background:#fff; border:1px solid #dadce0; box-shadow:0px 4px 16px rgba(0,0,0,0.2); border-radius:8px; padding:10px; z-index:100000; font-family:sans-serif; width:170px; display:flex; flex-direction:column; gap:6px; user-select:none;`;

        let labelTracker = document.createElement('div');
        labelTracker.style.cssText = 'font-size:11px; font-weight:bold; color:#5f6368; text-align:center; margin-bottom:2px;';
        labelTracker.innerText = '1 × 1 Table';
        popup.appendChild(labelTracker);

        let gridBox = document.createElement('div');
        gridBox.style.cssText = 'display:grid; grid-template-columns:repeat(10, 1fr); gap:2px; background:#fff;';

        for (let r = 1; r <= 10; r++) {
          for (let c = 1; c <= 10; c++) {
            let block = document.createElement('div');
            block.className = 'matrix-dot';
            block.dataset.row = r;
            block.dataset.col = c;
            block.style.cssText = 'width:14px; height:14px; background:#f1f3f4; border:1px solid #e0e0e0; border-radius:2px; cursor:pointer; box-sizing:border-box;';
            gridBox.appendChild(block);
          }
        }
        popup.appendChild(gridBox);
        document.body.appendChild(popup);

        gridBox.addEventListener('mouseover', (event) => {
          const item = event.target;
          if (!item.classList.contains('matrix-dot')) return;
          const targetRow = parseInt(item.dataset.row);
          const targetCol = parseInt(item.dataset.col);
          labelTracker.innerText = `${targetRow} × ${targetCol} Grid Layout`;

          popup.querySelectorAll('.matrix-dot').forEach(el => {
            const r = parseInt(el.dataset.row);
            const c = parseInt(el.dataset.col);
            if (r <= targetRow && c <= targetCol) {
              el.style.backgroundColor = '#e8f0fe'; el.style.borderColor = '#1a73e8';
            } else {
              el.style.backgroundColor = '#f1f3f4'; el.style.borderColor = '#e0e0e0';
            }
          });
        });

        gridBox.addEventListener('click', (event) => {
          const item = event.target;
          if (!item.classList.contains('matrix-dot')) return;
          buildNewGridTable(parseInt(item.dataset.row), parseInt(item.dataset.col), editable);
          popup.remove();
        });
      });

      btnUndo.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (customUndoStack.length === 0) return;
        const current = customUndoStack.pop();
        const container2 = current.containerRef || current.tableRef;
        if (!container2) return;

        if (current.type === 'draftGlobal') {
          customRedoStack.push({ type: 'draftGlobal', containerRef: container2, html: container2.innerHTML });
          container2.innerHTML = current.html;
        } else {
          customRedoStack.push({ type: 'tableInline', tableRef: container2, html: container2.innerHTML, style: container2.style.cssText });
          container2.innerHTML = current.html; container2.style.cssText = current.style;
        }
        activeGmailCell = container2.querySelector('td');
      });

      btnRedo.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (customRedoStack.length === 0) return;
        const current = customRedoStack.pop();
        const container2 = current.containerRef || current.tableRef;
        if (!container2) return;

        if (current.type === 'draftGlobal') {
          customUndoStack.push({ type: 'draftGlobal', containerRef: container2, html: container2.innerHTML });
          container2.innerHTML = current.html;
        } else {
          customUndoStack.push({ type: 'tableInline', tableRef: container2, html: container2.innerHTML, style: container2.style.cssText });
          container2.innerHTML = current.html; container2.style.cssText = current.style;
        }
        activeGmailCell = container2.querySelector('td');
      });

      btnInsert.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        spawnCustomPopupList(btnInsert, [
          { text: 'Row Above ↑', value: 'row-above' },
          { text: 'Row Below ↓', value: 'row-below' },
          { text: 'Col Left ←', value: 'col-left' },
          { text: 'Col Right →', value: 'col-right' }
        ], (action) => {
          const row = activeGmailCell.parentElement;
          const table = activeGmailCell.closest('table.gmail-custom-table') || activeGmailCell.closest('table');
          if (!table || !row) return;

          commitSnapshot(table, 'tableInline');
          const colCount = row.children.length;
          const cellIndex = activeGmailCell.cellIndex;

          if (action === 'row-above' || action === 'row-below') {
            const newRow = document.createElement('tr');
            for (let i = 0; i < colCount; i++) {
              newRow.innerHTML += `<td style="padding:8px; border:1px solid #dadce0; text-align:left; vertical-align:top; width:120px; word-break:break-all;">&nbsp;</td>`;
            }
            if (action === 'row-above') row.parentNode.insertBefore(newRow, row);
            else row.parentNode.insertBefore(newRow, row.nextSibling);
          } else {
            const colGroup = table.querySelector('colgroup');
            if (colGroup) colGroup.appendChild(document.createElement('col'));

            table.querySelectorAll('tr').forEach((r, idx) => {
              const targetCell = r.children[cellIndex];
              if (targetCell) {
                const newCell = document.createElement('td');
                if (idx === 0) {
                  newCell.style.cssText = `padding:8px; border:1px solid #dadce0; font-weight:bold; text-align:center; background-color:#f8f9fa; width:120px; word-break:break-all;`;
                  newCell.innerHTML = 'Header';
                } else {
                  newCell.style.cssText = `padding:8px; border:1px solid #dadce0; text-align:left; vertical-align:top; width:120px; word-break:break-all;`;
                  newCell.innerHTML = '&nbsp;';
                }
                if (action === 'col-left') targetCell.parentNode.insertBefore(newCell, targetCell);
                else targetCell.parentNode.insertBefore(newCell, targetCell.nextSibling);
              }
            });
          }
        });
      });

      btnTheme.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!activeGmailCell) { toast('Click inside a table cell first'); return; }

        const lockedTableRef = activeGmailCell.closest('table.gmail-custom-table') || activeGmailCell.closest('table');
        if (!lockedTableRef) return;

        removeAllPopups();
        const rect = btnTheme.getBoundingClientRect();
        const popup = document.createElement('div');
        popup.className = 'table-designer-popup';
        popup.style.cssText = `position:fixed; top:${rect.top - 280}px; left:${rect.left}px; background:#fff; border:1px solid #dadce0; box-shadow:0px 4px 16px rgba(0,0,0,0.2); border-radius:8px; padding:12px; z-index:100000; font-family:sans-serif; width:360px; display:flex; flex-direction:column; gap:8px;`;

        popup.innerHTML = `
          <label style="font-size:10px; font-weight:bold; color:#5f6368;">1. TARGET CONFIGURATION RANGE</label>
          <select id="designer-scope" style="font-size:11px; padding:4px; border:1px solid #dadce0; border-radius:4px; width:100%; background:#f8f9fa; outline:none; cursor:pointer; height:24px;">
            <option value="selection">Selected / Highlighted Cells</option>
            <option value="row">Entire Current Row</option>
            <option value="col">Entire Current Column</option>
            <option value="grid">Gridlines Border Color</option>
            <option value="reset-formatting">Wipe All Formatting (Keep Text Data)</option>
            <option value="reset-grid">Reset Gridlines Only to Gray</option>
          </select>
          <div style="display: flex; gap:16px; margin-top:4px;" id="palette-twin-columns">
            <div style="flex: 1;">
              <div style="font-size:11px; font-weight:500; color:#202124; margin-bottom:6px;">Background color</div>
              ${generatePaletteHtml('bg')}
            </div>
            <div style="flex: 1;">
              <div style="font-size:11px; font-weight:500; color:#202124; margin-bottom:6px;">Text color</div>
              ${generatePaletteHtml('text')}
            </div>
          </div>
          <button id="close-designer" style="font-size:11px; padding:4px; cursor:pointer; border-radius:4px; border:1px solid #dadce0; background:#fff; width:100%; font-weight:500; outline:none; height:24px;">Cancel</button>
        `;

        document.body.appendChild(popup);
        popup.querySelector('#close-designer').addEventListener('click', () => popup.remove());

        popup.querySelector('#designer-scope').addEventListener('change', (event) => {
          const scope = event.target.value;
          if (scope === 'reset-formatting') {
            commitSnapshot(lockedTableRef, 'tableInline');
            lockedTableRef.querySelectorAll('td').forEach(c => { c.style.backgroundColor = 'transparent'; c.style.color = '#000000'; });
            popup.remove();
          } else if (scope === 'reset-grid') {
            commitSnapshot(lockedTableRef, 'tableInline');
            lockedTableRef.style.setProperty('border', '1px solid #dadce0', 'important');
            lockedTableRef.querySelectorAll('td').forEach(c => { c.style.setProperty('border', '1px solid #dadce0', 'important'); });
            popup.remove();
          }
        });

        popup.querySelector('#palette-twin-columns').addEventListener('click', (event) => {
          const swatch = event.target.closest('[data-color]');
          if (!swatch) return;

          const color = swatch.getAttribute('data-color');
          const type = swatch.getAttribute('data-type');
          const scope = popup.querySelector('#designer-scope').value;

          commitSnapshot(lockedTableRef, 'tableInline');

          if (scope === 'grid') {
            lockedTableRef.style.setProperty('border', `1px solid ${color}`, 'important');
            lockedTableRef.querySelectorAll('td').forEach(c => c.style.setProperty('border', `1px solid ${color}`, 'important'));
          } else {
            const targetCells = getActiveScopeCells(lockedTableRef, scope);
            targetCells.forEach(cell => {
              if (type === 'bg') cell.style.setProperty('background-color', color, 'important');
              else if (type === 'text') {
                cell.style.setProperty('color', color, 'important');
                cell.querySelectorAll('span, font').forEach(el => el.style.color = 'inherit');
              }
            });
          }
          popup.remove();
        });
      });

      btnSize.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        spawnCustomPopupList(btnSize, [
          { text: 'Col Shorter ←', value: 'shrink-col' },
          { text: 'Col Wider →', value: 'grow-col' },
          { text: 'Row Shorter ↑', value: 'shrink-row' },
          { text: 'Row Taller ↓', value: 'grow-row' }
        ], (action) => {
          const table = activeGmailCell.closest('table.gmail-custom-table') || activeGmailCell.closest('table');
          if (!table) return;

          commitSnapshot(table, 'tableInline');
          const cellIndex = activeGmailCell.cellIndex;

          if (action === 'grow-col' || action === 'shrink-col') {
            let colGroup = table.querySelector('colgroup');
            if (!colGroup) {
              colGroup = document.createElement('colgroup');
              const firstRowCells = table.querySelector('tr').children.length;
              for (let i = 0; i < firstRowCells; i++) { colGroup.appendChild(document.createElement('col')); }
              table.insertBefore(colGroup, table.firstChild);
            }

            const targetColTag = colGroup.children[cellIndex];
            let currentWidth = activeGmailCell.offsetWidth || 120;
            let newWidth = action === 'grow-col' ? currentWidth + 30 : Math.max(60, currentWidth - 30);

            if (targetColTag) targetColTag.style.width = `${newWidth}px`;

            const colCells = getActiveScopeCells(table, 'col');
            colCells.forEach(c => c.style.setProperty('width', `${newWidth}px`, 'important'));
          } else {
            const row = activeGmailCell.parentElement;
            if (row) {
              let currentHeight = row.offsetHeight || 35;
              let newHeight = action === 'grow-row' ? currentHeight + 15 : Math.max(20, currentHeight - 15);
              row.style.setProperty('height', `${newHeight}px`, 'important');
            }
          }
        });
      });

      btnDelete.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        spawnCustomPopupList(btnDelete, [
          { text: '🧼 Clear Cell Data', value: 'clear' },
          { text: '➖ Delete Row', value: 'row' },
          { text: '➖ Delete Column', value: 'col' }
        ], (action) => {
          const lockedTableRef = activeGmailCell.closest('table.gmail-custom-table') || activeGmailCell.closest('table');
          if (!lockedTableRef) return;

          commitSnapshot(lockedTableRef, 'tableInline');

          if (action === 'clear') {
            const targetCells = getActiveScopeCells(lockedTableRef, 'selection');
            targetCells.forEach(cell => { cell.innerHTML = '&nbsp;'; cell.style.backgroundColor = 'transparent'; cell.style.color = '#000000'; });
          } else if (action === 'row') {
            const row = activeGmailCell.parentElement;
            const nextActiveCell = row.nextElementSibling?.children[activeGmailCell.cellIndex] || row.previousElementSibling?.children[activeGmailCell.cellIndex];
            row.remove();
            activeGmailCell = nextActiveCell || null;
          } else if (action === 'col') {
            const cellIndex = activeGmailCell.cellIndex;
            const rows = lockedTableRef.querySelectorAll('tr');
            const nextActiveCell = activeGmailCell.nextElementSibling || activeGmailCell.previousElementSibling;

            const colGroup = lockedTableRef.querySelector('colgroup');
            if (colGroup && colGroup.children[cellIndex]) colGroup.children[cellIndex].remove();

            rows.forEach(r => { if (r.children[cellIndex]) r.children[cellIndex].remove(); });
            activeGmailCell = nextActiveCell || null;
          }
        });
      });

      container.appendChild(btnTable);
      container.appendChild(btnUndo);
      container.appendChild(btnRedo);
      container.appendChild(btnInsert);
      container.appendChild(btnTheme);
      container.appendChild(btnSize);
      container.appendChild(btnDelete);
      toolbar.appendChild(container);
    });
  }

  // ---- Active-cell / selection tracking ----
  let isMouseDown = false;
  let startCell = null;

  function processActiveCellChange(element) {
    if (!element || element.nodeType !== 1) return null;
    const cell = element.closest('td');
    if (!cell) return null;

    const isInsideDraftArea = cell.closest('div[contenteditable="true"]');
    if (!isInsideDraftArea) return null;

    const parentTable = cell.closest('table');
    if (parentTable) {
      if (!parentTable.classList.contains('gmail-custom-table') && !parentTable.querySelector('table')) {
        parentTable.classList.add('gmail-custom-table');
      }
      activeGmailCell = cell;
      return cell;
    }
    return null;
  }

  function bindOnce() {
    if (bound) return;
    bound = true;

    document.addEventListener('mousedown', (e) => {
      if (!enabled) return;
      const cell = processActiveCellChange(e.target);
      if (cell) {
        isMouseDown = true;
        startCell = cell;
        lastSelectedCells = [cell];
      }
    }, true);

    document.addEventListener('mouseover', (e) => {
      if (!enabled || !isMouseDown || !startCell) return;
      const currentCell = processActiveCellChange(e.target);
      const table = startCell.closest('table.gmail-custom-table');

      if (currentCell && table && currentCell.closest('table') === table) {
        const startRow = startCell.parentElement.rowIndex;
        const endRow = currentCell.parentElement.rowIndex;
        const startCol = startCell.cellIndex;
        const endCol = startCell.cellIndex;

        const minR = Math.min(startRow, endRow);
        const maxR = Math.max(startRow, endRow);
        const minC = Math.min(startCol, endCol);
        const maxC = Math.max(startCol, endCol);

        const mappedCells = [];
        const rows = table.querySelectorAll('tr');

        for (let r = minR; r <= maxR; r++) {
          if (rows[r]) {
            for (let c = minC; c <= maxC; c++) {
              if (rows[r].children[c]) mappedCells.push(rows[r].children[c]);
            }
          }
        }
        lastSelectedCells = mappedCells;
      }
    }, true);

    document.addEventListener('mouseup', () => { isMouseDown = false; }, true);

    document.addEventListener('keyup', (e) => {
      if (!enabled) return;
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        processActiveCellChange(selection.getRangeAt(0).commonAncestorContainer);
      }
    }, true);

    document.addEventListener('click', (e) => {
      if (!enabled) return;
      if (!e.target.closest('.table-designer-popup') && !e.target.closest('.grid-matrix-popup') && !e.target.closest('.action-dropdown-popup')) {
        removeAllPopups();
      }
    });

    // Smart paste: spread tab-separated (spreadsheet) data across table cells.
    document.addEventListener('paste', (e) => {
      if (!enabled) return;
      let targetNode = e.target;
      if (targetNode && targetNode.nodeType === 3) targetNode = targetNode.parentElement;

      if (!targetNode || targetNode.nodeType !== 1) return;
      const cell = targetNode.closest('td');
      if (!cell || !cell.closest('table.gmail-custom-table')) return;

      const clipboardData = e.clipboardData || window.clipboardData;
      const pastedText = clipboardData.getData('text/plain');

      if (pastedText.includes('\t')) {
        e.preventDefault();

        // Drop the trailing empty field a terminal tab leaves behind.
        const columnsData = pastedText.split('\t').map(val => val.trim()).filter((val, index, arr) => {
          if (index === arr.length - 1 && val === '') return false;
          return true;
        });

        let targetCell = cell;
        const parentRow = cell.parentElement;
        const rowBgColor = parentRow ? parentRow.style.backgroundColor : '';
        const hasActiveRowTheme = rowBgColor && rowBgColor !== 'transparent' && rowBgColor !== 'initial' && rowBgColor !== '';

        columnsData.forEach(val => {
          if (targetCell) {
            const cleanContent = val.replace(/\r?\n/g, '<br>');
            targetCell.innerHTML = cleanContent || '&nbsp;';

            targetCell.style.fontFamily = 'sans-serif';
            targetCell.style.fontSize = '13px';
            targetCell.style.lineHeight = '1.4';

            if (hasActiveRowTheme) {
              targetCell.style.setProperty('background-color', rowBgColor, 'important');
            } else {
              if (!targetCell.style.backgroundColor || targetCell.style.backgroundColor === 'transparent' || targetCell.style.backgroundColor === '') {
                targetCell.style.backgroundColor = 'transparent';
              }
            }

            targetCell.querySelectorAll('span, font, div, p').forEach(el => {
              el.style.color = 'inherit';
              el.style.fontFamily = 'inherit';
              el.style.fontSize = 'inherit';
              el.style.lineHeight = 'inherit';
            });

            targetCell = targetCell.nextElementSibling;
          }
        });
      }
    });
  }

  function teardown() {
    if (injectTimer) { clearInterval(injectTimer); injectTimer = null; }
    removeAllPopups();
    document.querySelectorAll('.ob-table-controls').forEach(el => el.remove());
  }

  // Idempotent + reversible: compose windows appear without a navigation, so an
  // inject-interval (from the original) keeps the toolbar buttons present while
  // enabled; disabling stops it and strips the injected controls.
  function init() {
    if (location.host !== 'mail.google.com') return;
    bindOnce();
    return window.__OB.settings.get('tableInserter').then((on) => {
      enabled = !!on;
      if (enabled) {
        if (!injectTimer) injectTimer = setInterval(() => {
          try { injectTableControls(); } catch (e) { console.warn('[OB] table-inserter:', e); }
        }, 2000);
        injectTableControls();
      } else {
        teardown();
      }
    }).catch((e) => console.log('[OB] table-inserter: init failed', e));
  }

  const api = { init };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).tableInserter = api;
})();
