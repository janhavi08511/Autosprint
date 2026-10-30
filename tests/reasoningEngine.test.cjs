const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'aeic-reasoning-test-'));

for (const file of ['types.ts', 'reasoningEngine.ts']) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  fs.writeFileSync(path.join(outputDirectory, file.replace('.ts', '.js')), output);
}

const { computeDecision, isActionUpgrade } = require(path.join(outputDirectory, 'reasoningEngine.js'));
const { ActionType, TaskStatus } = require(path.join(outputDirectory, 'types.js'));
const now = 1_000_000;
const hour = 60 * 60 * 1000;

function task({ deadline, priority = 'MEDIUM', status = TaskStatus.IN_PROGRESS }) {
  return { deadline, priority, status };
}

function user(reliabilityScore) {
  return { name: 'Assignee', reliabilityScore };
}

after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }));

test('low risk produces no action', () => {
  assert.deepEqual(
    computeDecision(task({ deadline: now + 24 * hour }), user(1), now),
    { riskScore: 0, action: ActionType.NONE, escalationPath: [] }
  );
});

test('deadline and reliability risk produce a reminder', () => {
  const result = computeDecision(
    task({ deadline: now + 5 * hour }),
    user(0.67),
    now
  );
  assert.equal(result.riskScore, 30);
  assert.equal(result.action, ActionType.REMIND);
});

test('priority modifies risk and produces a risk alert', () => {
  const result = computeDecision(
    task({ deadline: now + 5 * hour, priority: 'HIGH' }),
    user(0.33),
    now
  );
  assert.equal(result.riskScore, 44);
  assert.equal(result.action, ActionType.RISK_ALERT);
});

test('high risk escalates through the manager level', () => {
  const result = computeDecision(
    task({ deadline: now - hour, priority: 'MEDIUM', status: TaskStatus.AT_RISK }),
    user(0.8),
    now
  );
  assert.equal(result.riskScore, 66);
  assert.equal(result.action, ActionType.ESCALATE);
  assert.deepEqual(result.escalationPath, ['Assignee', 'Team Lead', 'Dept Manager']);
});

test('critical risk escalates through the admin level', () => {
  const result = computeDecision(
    task({ deadline: now - hour, priority: 'MEDIUM', status: TaskStatus.AT_RISK }),
    user(0),
    now
  );
  assert.equal(result.riskScore, 90);
  assert.equal(result.action, ActionType.CRITICAL_ESCALATE);
  assert.deepEqual(result.escalationPath, [
    'Assignee',
    'Team Lead',
    'Dept Manager',
    'Admin',
  ]);
});

test('a lower action after escalation does not trigger a second action', () => {
  assert.equal(
    isActionUpgrade(ActionType.ESCALATE, ActionType.CRITICAL_ESCALATE),
    false
  );
});

test('higher action severity is treated as an escalation', () => {
  assert.equal(isActionUpgrade(ActionType.CRITICAL_ESCALATE, ActionType.ESCALATE), true);
});
