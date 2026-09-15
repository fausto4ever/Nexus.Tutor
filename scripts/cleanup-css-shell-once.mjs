import fs from 'node:fs/promises';

const url=new URL('../css/nexus-tutor.css',import.meta.url);
let css=await fs.readFile(url,'utf8');
const beforeImportant=(css.match(/!important/g)||[]).length;

function replaceExact(label,before,after){
  if(!css.includes(before))throw new Error(`No se encontró bloque esperado: ${label}`);
  css=css.replace(before,after);
}

replaceExact('body/html theme',`  font-family: var(--font-sans)!important;\n  background: var(--bg-main)!important;\n  color: var(--text-primary)!important`,`  font-family: var(--font-sans);\n  background: var(--bg-main);\n  color: var(--text-primary)`);

replaceExact('app-shell',`.app-shell {\n  width: 100%!important;\n  max-width: 480px!important;\n  min-height: 100dvh;\n  margin: 0 auto!important;\n  padding: 0 0 calc(84px + env(safe-area-inset-bottom))!important;\n  background: var(--bg-gradient)!important\n}`,`.app-shell {\n  width: 100%;\n  max-width: 480px;\n  min-height: 100dvh;\n  margin: 0 auto;\n  padding: 0 0 calc(84px + env(safe-area-inset-bottom));\n  background: var(--bg-gradient)\n}`);

replaceExact('topbar',`.topbar {\n  position: sticky;\n  top: 0;\n  z-index: 50;\n  padding: 14px 16px!important;\n  background: var(--bg-nav);\n  backdrop-filter: blur(12px);\n  border-bottom: 1px solid var(--border-color);\n  box-shadow: none!important\n}`,`.topbar {\n  position: sticky;\n  top: 0;\n  z-index: 50;\n  padding: 14px 16px;\n  background: var(--bg-nav);\n  backdrop-filter: blur(12px);\n  border-bottom: 1px solid var(--border-color);\n  box-shadow: none\n}`);

replaceExact('topbar h1',`.topbar h1 {\n  font-size: 1.08rem!important;\n  margin: 2px 0 0!important\n}`,`.topbar h1 {\n  font-size: 1.08rem;\n  margin: 2px 0 0\n}`);

replaceExact('eyebrow',`.eyebrow {\n  font-size: .67rem!important;\n  letter-spacing: .1em!important;\n  color: var(--accent-blue)!important\n}`,`.eyebrow {\n  font-size: .67rem;\n  letter-spacing: .1em;\n  color: var(--accent-blue)\n}`);

replaceExact('connection badge',`.connection-badge {\n  white-space: nowrap;\n  padding: 5px 9px!important;\n  font-size: .67rem!important\n}`,`.connection-badge {\n  white-space: nowrap;\n  padding: 5px 9px;\n  font-size: .67rem\n}`);

replaceExact('icon button',`.icon-btn {\n  width: 38px!important;\n  height: 38px!important;\n  padding: 0!important;\n  border-radius: 50%!important;\n  background: 0 0!important;\n  color: var(--text-muted)!important;\n  box-shadow: none!important;\n  display: grid;\n  place-items: center\n}`,`.icon-btn {\n  width: 38px;\n  height: 38px;\n  padding: 0;\n  border-radius: 50%;\n  background: 0 0;\n  color: var(--text-muted);\n  box-shadow: none;\n  display: grid;\n  place-items: center\n}`);

replaceExact('icon button hover',`.icon-btn:hover {\n  background: var(--input-bg)!important\n}`,`.icon-btn:hover {\n  background: var(--input-bg)\n}`);

replaceExact('mobile topbar',`  .topbar {\n    padding-left: 14px!important;\n    padding-right: 12px!important\n  }`,`  .topbar {\n    padding-left: 14px;\n    padding-right: 12px\n  }`);

const afterImportant=(css.match(/!important/g)||[]).length;
if(beforeImportant-afterImportant!==27){
  throw new Error(`Se esperaban 27 !important menos; resultado ${beforeImportant} -> ${afterImportant}`);
}

await fs.writeFile(url,css,'utf8');
console.log(`Shell CSS limpio: !important ${beforeImportant} -> ${afterImportant}.`);
