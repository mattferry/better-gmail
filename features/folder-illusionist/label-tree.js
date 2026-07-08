(function () {
  'use strict';
  function buildLabelTree(fullNames) {
    const root = { name: '', fullName: '', children: [] };
    const index = new Map([['', root]]);
    const sorted = [...new Set(fullNames)].sort((a, b) => a.localeCompare(b));
    for (const full of sorted) {
      const parts = full.split('/');
      let parentPath = '';
      for (let i = 0; i < parts.length; i++) {
        const path = i === 0 ? parts[0] : parentPath + '/' + parts[i];
        if (!index.has(path)) {
          const node = { name: parts[i], fullName: path, children: [] };
          index.get(parentPath).children.push(node);
          index.set(path, node);
        }
        parentPath = path;
      }
    }
    return root.children;
  }
  const api = { buildLabelTree };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).labelTree = api;
})();
