import fs from 'node:fs/promises';

const url=new URL('../css/nexus-tutor.css',import.meta.url);
let css=await fs.readFile(url,'utf8');

const cleanedSignature=`.topbar {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;`;
if(css.includes(cleanedSignature)){
  console.log('Header CSS ya consolidado; sin cambios.');
  process.exit(0);
}

function replaceOnce(search,replacement,label){
  const count=css.split(search).length-1;
  if(count!==1)throw new Error(`${label}: se esperaba 1 coincidencia y se encontraron ${count}`);
  css=css.replace(search,replacement);
}

replaceOnce(
`.distance-meta,\n.school-heading,\n.section-title,\n.settings-actions,\n.settings-head,\n.sync-row,\n.threshold-row,\n.topbar {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px\n}`,
`.distance-meta,\n.school-heading,\n.section-title,\n.settings-actions,\n.settings-head,\n.sync-row,\n.threshold-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px\n}`,
'grupo flex header');

replaceOnce(
`.eyebrow {\n  letter-spacing: .14em;\n  font-weight: 800;\n  color: #64748b\n}\n`,
'',
'eyebrow legacy');

replaceOnce(
`.settings-head h2,\n.topbar h1 {\n  margin: 2px 0 0;\n  font-size: 1.5rem\n}`,
`.settings-head h2 {\n  margin: 2px 0 0;\n  font-size: 1.5rem\n}`,
'topbar h1 legacy');

replaceOnce(
`.icon-btn {\n  border: 0;\n  box-shadow: 0 6px 18px rgba(15,23,42,.08);\n  font-size: 1.1rem\n}\n`,
'',
'icon-btn legacy');

replaceOnce(
`.topbar {\n  position: sticky;\n  top: 0;\n  z-index: 50;\n  padding: 14px 16px!important;\n  background: var(--bg-nav);\n  backdrop-filter: blur(12px);\n  border-bottom: 1px solid var(--border-color);\n  box-shadow: none!important\n}`,
`.topbar {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  position: sticky;\n  top: 0;\n  z-index: 50;\n  padding: 14px 16px;\n  background: var(--bg-nav);\n  backdrop-filter: blur(12px);\n  border-bottom: 1px solid var(--border-color);\n  box-shadow: none\n}`,
'topbar final');

replaceOnce(
`.topbar h1 {\n  font-size: 1.08rem!important;\n  margin: 2px 0 0!important\n}`,
`.topbar h1 {\n  font-size: 1.08rem;\n  margin: 2px 0 0\n}`,
'topbar h1 final');

replaceOnce(
`.eyebrow {\n  font-size: .67rem!important;\n  letter-spacing: .1em!important;\n  color: var(--accent-blue)!important\n}`,
`.eyebrow {\n  font-size: .67rem;\n  letter-spacing: .1em;\n  font-weight: 800;\n  color: var(--accent-blue)\n}`,
'eyebrow final');

replaceOnce(
`.connection-badge {\n  white-space: nowrap;\n  padding: 5px 9px!important;\n  font-size: .67rem!important\n}`,
`.connection-badge {\n  white-space: nowrap;\n  padding: 5px 9px;\n  font-size: .67rem\n}`,
'connection badge');

replaceOnce(
`.icon-btn {\n  width: 38px!important;\n  height: 38px!important;\n  padding: 0!important;\n  border-radius: 50%!important;\n  background: 0 0!important;\n  color: var(--text-muted)!important;\n  box-shadow: none!important;\n  display: grid;\n  place-items: center\n}`,
`.icon-btn {\n  width: 38px;\n  height: 38px;\n  padding: 0;\n  border: 0;\n  border-radius: 50%;\n  background: 0 0;\n  color: var(--text-muted);\n  box-shadow: none;\n  display: grid;\n  place-items: center;\n  font-size: 1.1rem\n}`,
'icon-btn final');

replaceOnce(
`.icon-btn:hover {\n  background: var(--input-bg)!important\n}`,
`.icon-btn:hover {\n  background: var(--input-bg)\n}`,
'icon-btn hover');

replaceOnce(
`  .topbar {\n    padding-left: 14px!important;\n    padding-right: 12px!important\n  }`,
`  .topbar {\n    padding-left: 14px;\n    padding-right: 12px\n  }`,
'topbar mobile');

await fs.writeFile(url,css,'utf8');
console.log('Header CSS consolidado sin alterar valores efectivos.');
