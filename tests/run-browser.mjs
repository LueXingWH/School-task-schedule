import {spawn} from 'node:child_process';
const channels=process.argv[2]==='matrix'?['chrome','msedge']:[process.argv[2]||'chrome'];
const scripts=process.argv[3]==='public'?['tests/public-web.mjs']:['tests/browser.mjs','tests/recognition.mjs','tests/install.mjs'];
for(const channel of channels) {
  if(!['chrome','msedge'].includes(channel))throw Error('Unsupported browser channel');
  for(const script of scripts)await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[script],{env:{...process.env,TEST_BROWSER:channel},stdio:'inherit',windowsHide:true});
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`${channel} ${script} failed (${code})`)));
  });
}
