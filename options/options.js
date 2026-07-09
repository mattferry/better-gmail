const S = window.__OB.settings;                 // dual-export gives us this in the options page
const CHECKS = ['darkModeGmail','darkModeCalendar','folderIllusionist','contextMenu',
  'categories','quickViews','confirmBeforeDelete','compactDensity',
  'attachmentsTop','autoCapitalize','formatPainter','tableInserter',
  'outlookReply','outlookReplyButton'];

function load() {
  S.getAll().then((s) => {
    document.getElementById('darkMode').value = s.darkMode;
    for (const k of CHECKS) document.getElementById(k).checked = !!s[k];
  });
}
function save(key, val) {
  S.set(key, val).then(() => {
    const el = document.getElementById('saved'); el.hidden = false;
    setTimeout(() => (el.hidden = true), 1200);
  });
}
document.getElementById('darkMode').addEventListener('change', (e) => save('darkMode', e.target.value));
for (const k of CHECKS) document.getElementById(k).addEventListener('change', (e) => save(k, e.target.checked));
load();
