
import { autoAssignTask, calculateAssignmentScore, getAssignmentRecommendation, calculateSkillMatch } from './assignmentService';
import { User, Task, UserRole, TaskStatus, ActionType } from './types';

// Mock Data
const mockUsers: User[] = [
    {
        id: 'u1',
        name: 'Alice',
        role: UserRole.ASSIGNEE,
        teamId: 't1',
        deptId: 'd1',
        reliabilityScore: 0.9,
        skills: ['TypeScript', 'React', 'Node.js'],
    },
    {
        id: 'u2',
        name: 'Bob',
        role: UserRole.ASSIGNEE,
        teamId: 't1',
        deptId: 'd1',
        reliabilityScore: 0.7,
        skills: ['Python', 'Django', 'SQL'],
    },
    {
        id: 'u3',
        name: 'Charlie',
        role: UserRole.ASSIGNEE,
        teamId: 't1',
        deptId: 'd1',
        reliabilityScore: 0.95,
        skills: ['TypeScript', 'Design'],
    }
];

const mockTask: Partial<Task> = {
    title: 'Build Login Page',
    requiredSkills: ['TypeScript', 'React']
};

console.log('--- Running Assignment Service Tests ---');
console.log(`Task: ${mockTask.title}`);
console.log(`Required Skills: ${mockTask.requiredSkills?.join(', ')}`);
console.log('----------------------------------------');

// Test 1: Calculate Skill Match
console.log('\n1. Testing calculateSkillMatch:');
mockUsers.forEach(user => {
    const match = calculateSkillMatch(user.skills, mockTask.requiredSkills || []);
    console.log(`   User: ${user.name}, Skills: [${user.skills.join(', ')}], Match: ${match.toFixed(1)}%`);
});

// Test 2: Calculate Assignment Score
console.log('\n2. Testing calculateAssignmentScore:');
mockUsers.forEach(user => {
    const score = calculateAssignmentScore(user, mockTask.requiredSkills);
    console.log(`   User: ${user.name}, Reliability: ${user.reliabilityScore}, Score: ${score.toFixed(1)}`);
});

// Test 3: Auto Assign Task
console.log('\n3. Testing autoAssignTask:');
try {
    const bestUserId = autoAssignTask(mockTask, mockUsers);
    const bestUser = mockUsers.find(u => u.id === bestUserId);
    console.log(`   Best Match User ID: ${bestUserId} (${bestUser?.name})`);
} catch (error) {
    console.error(`   Error assigning task: ${error}`);
}

// Test 4: Get Detailed Recommendation
console.log('\n4. Testing getAssignmentRecommendation for Alice:');
const recommendation = getAssignmentRecommendation(mockUsers[0], mockTask.requiredSkills);
console.log(JSON.stringify(recommendation, null, 2));

console.log('\n--- Tests Completed ---');
