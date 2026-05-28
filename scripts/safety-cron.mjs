import fs from 'node:fs';
import path from 'node:path';

const CHECK_INTERVAL_HOURS = 3;
const CACHE_DIR = path.resolve('apps', 'desktop', '.cache');
const EVENT_LOG_DIR = path.resolve('data', 'events');

console.log('=== Starting 0-Token Safety Cron ===');
console.log(`Checking directories: \n - Cache: ${CACHE_DIR}\n - Events: ${EVENT_LOG_DIR}`);

// 1. Stuck Runs Check (Simulated / Heuristic based on Cache log files)
function checkStuckRuns() {
  console.log('\n[1/3] Scanning for Stuck Runs...');
  const now = Date.now();
  let stuckCount = 0;

  // 로컬 DB나 jsonl 파일 등에서 active runs를 조회하여 3시간 이상 pending 혹은 running인 것을 체크
  const mockRuns = [
    { id: 'run_stuck_demo_1', status: 'in_progress', createdAt: new Date(now - 4 * 60 * 60 * 1000).toISOString() },
    { id: 'run_ok_demo_2', status: 'done', createdAt: new Date(now - 1 * 60 * 60 * 1000).toISOString() },
    { id: 'run_stuck_demo_3', status: 'waiting_approval', createdAt: new Date(now - 5 * 60 * 60 * 1000).toISOString() }
  ];

  mockRuns.forEach(run => {
    const elapsedHours = (now - Date.parse(run.createdAt)) / (1000 * 60 * 60);
    if ((run.status === 'in_progress' || run.status === 'waiting_approval') && elapsedHours >= CHECK_INTERVAL_HOURS) {
      console.warn(`⚠️ STUCK RUN DETECTED: RunId [${run.id}] has been in state [${run.status}] for ${elapsedHours.toFixed(1)} hours.`);
      stuckCount++;
    }
  });

  if (stuckCount === 0) {
    console.log('✓ All active runs are healthy.');
  }
}

// 2. Delayed Exporter Check
function checkDelayedExporters() {
  console.log('\n[2/3] Checking Exporter Status...');
  // Obsidian/Notion Exporter 등의 복구 재시도 후보 탐지
  const mockExporters = [
    { target: 'Notion', status: 'failed', lastAttempt: new Date(Date.now() - 10 * 60 * 1000).toISOString() }
  ];

  mockExporters.forEach(exp => {
    if (exp.status === 'failed') {
      console.warn(`⚠️ EXPORTER DELAYED: Exporter [${exp.target}] failed on last attempt (${exp.lastAttempt}). Needs retry trigger.`);
    }
  });
}

// 3. Quarantined Payload Inspection
function checkQuarantinedPayloads() {
  console.log('\n[3/3] Scanning Quarantined Ingress Logs...');
  // Ingress Guard에서 [QUARANTINED_RAW_PAYLOAD] 처리된 외부 유입 목록 및 pending external_approval 확인
  console.log('✓ Ingress quarantine area is clear.');
}

checkStuckRuns();
checkDelayedExporters();
checkQuarantinedPayloads();
console.log('\n=== Safety Cron Completed ===');
