import { auditNuketown2Oriented } from '../../src/nuketown2-oriented-coplanar-audit';

const audit = auditNuketown2Oriented();
const findings = audit.rows.filter(
  (row) => row.classification === 'oriented-finding' || row.classification === 'oriented-back-to-back-finding'
);

console.log(`TOTAL FINDINGS: ${findings.length}`);
for (const row of findings) {
  console.log(`${row.gap.toFixed(4)} m | ${row.overlap.toFixed(4)} m2 | ${row.first.name} | ${row.second.name}`);
}
