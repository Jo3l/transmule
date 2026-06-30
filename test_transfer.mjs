/**
 * Large file transfer test for TransMule
 *
 * Tests:
 * 1. COPY test_7gb.bin → media/ (SMB mount)
 * 2. COPY test_7gb.bin → data/ (SMB mount)
 * 3. DELETE the copied files from SMB mounts
 *
 * While copying, polls transfer-status every 2s to ensure it
 * doesn't stall and reports correct progress.
 *
 * Usage: TOKEN=<jwt> node test_transfer.mjs
 */

const BASE = 'http://localhost:3000';
const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error('ERROR: Set TOKEN env var');
  process.exit(1);
}

async function api(path, opts = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
      ...opts.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.statusMessage || data.message || String(res.status));
  return data;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pollJob(jobId, label, timeoutMs = 600000) {
  const start = Date.now();
  let lastPct = -1;
  let stallCount = 0;
  let lastBytesDone = 0;

  while (Date.now() - start < timeoutMs) {
    const status = await api(`/api/files/transfer-status?jobId=${jobId}`);
    const pct = status.percent;
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const bytesDone = status.bytesDone || 0;
    const bytesTotal = status.bytesTotal || 0;
    const speed = bytesDone && parseFloat(elapsed) > 0
      ? `${(bytesDone / 1024 / 1024 / parseFloat(elapsed)).toFixed(1)} MB/s`
      : 'N/A';
    const gbDone = (bytesDone / 1073741824).toFixed(2);
    const gbTotal = (bytesTotal / 1073741824).toFixed(2);

    if (pct !== lastPct || status.status !== 'running') {
      console.log(`  [${elapsed}s] ${label}: ${pct}% (${gbDone}/${gbTotal} GB) speed=${speed} status=${status.status}`);
      lastPct = pct;
    }

    // Detect stall: if bytesDone doesn't change for 30 seconds
    if (bytesDone === lastBytesDone && pct > 0 && status.status === 'running') {
      stallCount++;
      if (stallCount >= 15) { // 15 * 2s = 30s without progress
        console.log(`  ⚠️  STALL DETECTED for ${label}: no progress for 30s at ${pct}%`);
      }
    } else {
      stallCount = 0;
    }
    lastBytesDone = bytesDone;

    if (status.status === 'done' || status.status === 'error') {
      console.log(`  >>> ${label} FINISHED: status=${status.status}${status.error ? ' error=' + status.error : ''}`);
      return status;
    }
    await sleep(2000);
  }

  const final = await api(`/api/files/transfer-status?jobId=${jobId}`);
  console.log(`  >>> ${label} TIMEOUT after ${((Date.now()-start)/1000).toFixed(0)}s: status=${final.status} pct=${final.percent} done=${final.bytesDone}/${final.bytesTotal}`);
  return final;
}

async function main() {
  const startTime = Date.now();
  console.log('=== TransMule Large File Transfer Tests ===');
  console.log(`Time: ${new Date().toISOString()}\n`);

  try {
    // ── TEST 1: COPY to media (SMB mount) ──
    console.log('--- TEST 1: COPY test_7gb.bin -> media/ (SMB) ---');
    const job1 = await api('/api/files/transfer', {
      method: 'POST',
      body: JSON.stringify({
        sources: ['test_7gb.bin'],
        destination: 'media',
        mode: 'copy',
      }),
    });
    console.log(`  Job ID: ${job1.jobId}`);
    const r1 = await pollJob(job1.jobId, 'copy->media');
    if (r1.status !== 'done') {
      throw new Error(`TEST 1 FAILED: status=${r1.status} error=${r1.error || 'none'}`);
    }
    console.log(`  ✅ TEST 1 PASSED\n`);

    // ── TEST 2: COPY to data (SMB mount) ──
    console.log('--- TEST 2: COPY test_7gb.bin -> data/ (SMB) ---');
    const job2 = await api('/api/files/transfer', {
      method: 'POST',
      body: JSON.stringify({
        sources: ['test_7gb.bin'],
        destination: 'data',
        mode: 'copy',
      }),
    });
    console.log(`  Job ID: ${job2.jobId}`);
    const r2 = await pollJob(job2.jobId, 'copy->data');
    if (r2.status !== 'done') {
      throw new Error(`TEST 2 FAILED: status=${r2.status} error=${r2.error || 'none'}`);
    }
    console.log(`  ✅ TEST 2 PASSED\n`);

    // ── Cleanup: DELETE copies from SMB mounts ──
    console.log('--- Cleanup: Deleting remote copies ---');
    console.log('  Deleting media/test_7gb.bin...');
    try {
      const del1 = await api('/api/files/delete', {
        method: 'POST',
        body: JSON.stringify({ paths: ['media/test_7gb.bin'] }),
      });
      console.log(`  Delete media result: ${JSON.stringify(del1)}`);
    } catch (e) {
      console.error(`  Delete media FAILED: ${e.message}`);
    }

    console.log('  Deleting data/test_7gb.bin...');
    try {
      const del2 = await api('/api/files/delete', {
        method: 'POST',
        body: JSON.stringify({ paths: ['data/test_7gb.bin'] }),
      });
      console.log(`  Delete data result: ${JSON.stringify(del2)}`);
    } catch (e) {
      console.error(`  Delete data FAILED: ${e.message}`);
    }

    // ── Verify remote mounts don't have local dirs ──
    console.log('\n--- Verification: local dirs ---');
    const { execSync } = await import('child_process');
    const localCheck = execSync(
      'ls -la /home/jo3l/www/transmule/downloads/media/ /home/jo3l/www/transmule/downloads/data/ 2>&1 || true'
    ).toString();
    console.log(localCheck);

    console.log('\n=== All tests completed ===');
    console.log(`Total time: ${((Date.now()-startTime)/1000).toFixed(1)}s`);

  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
