import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'analysis', 'haifn_june_july_2026');
const SUMMARY_PATH = path.join(DIR, 'analysis_summary.json');
const NOTEBOOK_PATH = path.join(DIR, 'haifn_june_july_2026_analysis.ipynb');
const PYTHON = 'C:\\Users\\Jin\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
const summary = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8'));
const june = summary.headline.june;
const july = summary.headline.july;

const markdownCell = (source) => ({ cell_type: 'markdown', metadata: {}, source: source.split(/(?<=\n)/) });
const codeCell = (source) => ({ cell_type: 'code', execution_count: null, metadata: {}, outputs: [], source: source.split(/(?<=\n)/) });

const cells = [
  markdownCell(`# 하이픈 6~7월 이용 분석\n\n## tl;dr\n\n- 7월 고유 이용자는 ${june.uniqueVisitors}명에서 ${july.uniqueVisitors}명으로 **69.0% 증가**, 방문일은 ${june.visitDays}일에서 ${july.visitDays}일로 **125.5% 증가**했다.\n- 7월 첫 방문자는 ${summary.retention.julyFirstTimeVisitors}명(69.4%)이고, 6→7월 유지율은 ${summary.retention.juneToJulyRetentionRate}%다.\n- 7월 비프로그램일 방문도 30일에서 49일로 늘어 성장은 행사일에만 한정되지 않았다.\n- 체류시간 중앙값은 ${june.medianMinutesPerVisitDay}분에서 ${july.medianMinutesPerVisitDay}분으로 거의 같으며, 7월 8시간 초과 기록 10건 때문에 공식 평균은 주의가 필요하다.\n`),
  markdownCell(`## Context & Methods\n\n### Key Assumptions\n\n- 분석 기간: 2026년 6월 1일~7월 31일, KST\n- 대상: 하이픈 location group의 등록 이용자, 관리자·STAFF 제외\n- 방문일: 체크아웃이 있고 하이픈 체류시간이 0분보다 큰 이용자-날짜\n- 원천: Supabase 직접 테이블 읽기. 세션화와 집계 코드는 \`scripts/analyze_haifn_june_july_2026.mjs\`에 보존\n- 개인정보는 노트북에 저장하지 않고 집계 결과만 사용\n`),
  codeCell(`import json\nfrom pathlib import Path\n\nsummary_path = Path.cwd() / "analysis" / "haifn_june_july_2026" / "analysis_summary.json"\nsummary = json.loads(summary_path.read_text(encoding="utf-8"))\nprint(summary["scope"])\n`),
  markdownCell(`## Data\n\n원천 행 수, 목적 기록 커버리지, 중복 및 체류 이상치를 확인한다.\n`),
  codeCell(`import json\nfrom pathlib import Path\n\nsummary = json.loads((Path.cwd() / "analysis" / "haifn_june_july_2026" / "analysis_summary.json").read_text(encoding="utf-8"))\ndq = summary["dataQuality"]\nprint("source rows:", dq["sourceRowCounts"])\nprint("exact duplicate logs:", dq["duplicateExactLogRows"])\nprint("purpose coverage:", dq["noteCoverageByMonth"])\nprint("duration sensitivity:", dq["durationSensitivity"])\n`),
  markdownCell(`## Results\n\n월별 핵심 지표와 유지·프로그램·목적 신호를 재확인한다.\n`),
  codeCell(`import json\nfrom pathlib import Path\n\nsummary = json.loads((Path.cwd() / "analysis" / "haifn_june_july_2026" / "analysis_summary.json").read_text(encoding="utf-8"))\nfor key in ("june", "july"):\n    m = summary["headline"][key]\n    print(m["label"], {\n        "uniqueVisitors": m["uniqueVisitors"],\n        "visitDays": m["visitDays"],\n        "visitsPerVisitor": m["visitsPerVisitor"],\n        "repeatRate": m["repeatRate"],\n        "medianMinutes": m["medianMinutesPerVisitDay"],\n        "top10VisitShare": m["top10VisitShare"],\n    })\nprint("changes:", summary["headline"]["changes"])\n`),
  codeCell(`import json\nfrom pathlib import Path\n\nsummary = json.loads((Path.cwd() / "analysis" / "haifn_june_july_2026" / "analysis_summary.json").read_text(encoding="utf-8"))\nprint("retention:", summary["retention"])\nprint("programs:")\nfor row in summary["programs"]:\n    print({k: row[k] for k in ("label", "programs", "attended", "attendanceRate", "programDayVisitShare", "nonProgramDayVisitDays")})\nprint("purpose tags:")\nfor row in summary["purposes"]:\n    print(row["label"], row["tagCounts"])\n`),
  markdownCell(`## Takeaways\n\n1. 7월 성장은 **신규 유입(34명)**과 **방문 빈도 증가(1.62→2.16일)**가 함께 만든 결과다.\n2. 7월 프로그램일 방문 비중은 53.8%지만 비프로그램일 방문도 63.3% 증가해, 일상 이용 기반도 확대됐다.\n3. 다음 KPI는 7월 첫 방문자의 8월 재방문율, 프로그램별 30일 내 재방문, 포인트 첫 사용 전환율이다.\n4. 체류시간은 중앙값을 기본으로 쓰고 8시간 초과 기록은 운영 데이터 품질 이슈로 분리해야 한다.\n`)
];

let executionCount = 0;
for (const cell of cells) {
  if (cell.cell_type !== 'code') continue;
  executionCount += 1;
  const source = cell.source.join('');
  const result = spawnSync(PYTHON, ['-c', source], { cwd: ROOT, encoding: 'utf8' });
  cell.execution_count = executionCount;
  if (result.status === 0) {
    cell.outputs = [{ name: 'stdout', output_type: 'stream', text: (result.stdout || '').split(/(?<=\n)/) }];
  } else {
    cell.outputs = [{
      output_type: 'error',
      ename: 'ExecutionError',
      evalue: (result.stderr || `exit code ${result.status}`).trim(),
      traceback: (result.stderr || '').split(/\r?\n/)
    }];
    throw new Error(`Notebook cell ${executionCount} failed: ${result.error?.message || result.stderr || `exit code ${result.status}`}`);
  }
}

const notebook = {
  cells,
  metadata: {
    kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
    language_info: { name: 'python', version: '3.12' }
  },
  nbformat: 4,
  nbformat_minor: 5
};

fs.writeFileSync(NOTEBOOK_PATH, `${JSON.stringify(notebook, null, 1)}\n`);
JSON.parse(fs.readFileSync(NOTEBOOK_PATH, 'utf8'));
console.log(JSON.stringify({ notebook: NOTEBOOK_PATH, codeCellsExecuted: executionCount, status: 'passed' }));
