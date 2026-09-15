import fs from 'node:fs/promises';
import CleanCSS from 'clean-css';

const css=await fs.readFile(new URL('../css/nexus-tutor.css',import.meta.url),'utf8');
const result=new CleanCSS({level:2,sourceMap:false,format:'beautify'}).minify(css);
if(result.errors.length)throw new Error(result.errors.join('\n'));
console.log('---CSS_CANDIDATE_BEGIN---');
console.log(result.styles);
console.log('---CSS_CANDIDATE_END---');
