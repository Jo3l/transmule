/**
 * test_7gb_smb.mjs — Test COPY 7GB to data/ and media/ (SMB mounts)
 * Shows every transfer-status poll output
 */

const s=ms=>new Promise(r=>setTimeout(r,ms));
const BASE='http://localhost:3000';
let t;

(async()=>{
  // Login
  const r1=await fetch(BASE+'/api/users/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'jo3l',password:'test123'})});
  t=(await r1.json()).token;
  console.log('=== COPY 7GB -> SMB tests ===\n');

  // ── TEST 1: COPY test_7gb.bin → data/ (SMB mount) ──
  console.log('--- TEST 1: COPY test_7gb.bin -> data/ (SMB) ---');
  let r=await fetch(BASE+'/api/files/transfer',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},body:JSON.stringify({sources:['test_7gb.bin'],destination:'data',mode:'copy'})});
  let j=(await r.json()).jobId;
  console.log('Job:',j);
  
  let pb=0,pt=Date.now();
  for(let i=0;i<180;i++){
    r=await fetch(BASE+'/api/files/transfer-status?jobId='+j,{headers:{'Authorization':'Bearer '+t}});
    let st=await r.json();
    let el=((Date.now()-pt)/1000).toFixed(1);
    let bd=st.bytesDone||0,bt=st.bytesTotal||0;
    let sp=bd-pb>0&&parseFloat(el)>0?(((bd-pb)/1048576/parseFloat(el)).toFixed(1)+' MB/s'):'-';
    console.log('['+el.padStart(6)+'s] '+st.status.padStart(7)+'  '+String(st.percent).padStart(3)+'%  '+(bd/1073741824).toFixed(2)+'/'+(bt/1073741824).toFixed(2)+' GB  '+sp+(st.error?'  ERROR: '+st.error:''));
    pb=bd;pt=Date.now();
    if(st.status!=='running') break;
    await s(2000);
  }

  // ── TEST 2: COPY test_7gb.bin → media/ (SMB mount) ──
  console.log('\n--- TEST 2: COPY test_7gb.bin -> media/ (SMB) ---');
  r=await fetch(BASE+'/api/files/transfer',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},body:JSON.stringify({sources:['test_7gb.bin'],destination:'media',mode:'copy'})});
  j=(await r.json()).jobId;
  console.log('Job:',j);
  
  pb=0;pt=Date.now();
  for(let i=0;i<180;i++){
    r=await fetch(BASE+'/api/files/transfer-status?jobId='+j,{headers:{'Authorization':'Bearer '+t}});
    let st=await r.json();
    let el=((Date.now()-pt)/1000).toFixed(1);
    let bd=st.bytesDone||0,bt=st.bytesTotal||0;
    let sp=bd-pb>0&&parseFloat(el)>0?(((bd-pb)/1048576/parseFloat(el)).toFixed(1)+' MB/s'):'-';
    console.log('['+el.padStart(6)+'s] '+st.status.padStart(7)+'  '+String(st.percent).padStart(3)+'%  '+(bd/1073741824).toFixed(2)+'/'+(bt/1073741824).toFixed(2)+' GB  '+sp+(st.error?'  ERROR: '+st.error:''));
    pb=bd;pt=Date.now();
    if(st.status!=='running') break;
    await s(2000);
  }

  // ── Cleanup ──
  console.log('\n--- Cleanup ---');
  // Delete local source
  const fs=await import('fs');
  try{fs.unlinkSync('/home/jo3l/www/transmule/downloads/test_7gb.bin');console.log('✓ test_7gb.bin deleted');}catch(e){}
  // Try to clean SMB files via API tree (best-effort)
  try{
    r=await fetch(BASE+'/api/files/tree?path='+encodeURIComponent('data'),{headers:{'Authorization':'Bearer '+t}});
    let tree=await r.json();
    if(tree.children){for(let c of tree.children){if(c.name==='test_7gb.bin'){/* can't delete via API easily */}}}
  }catch(e){}

  console.log('\n=== Done ===');
  process.exit(0);
})().catch(e=>{console.error('FATAL:',e.message);process.exit(1);});
