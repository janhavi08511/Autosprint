import { User, Task } from './types';

/**
 * Calculate skill match percentage between user skills and required skills
 * @returns 0-100 percentage
 */
export function calculateSkillMatch(userSkills: string[], requiredSkills: string[]): number {
    if (!requiredSkills || requiredSkills.length === 0) {
        return 100; // No specific skills required, everyone matches
    }

    if (!userSkills || userSkills.length === 0) {
        return 0; // User has no skills
    }

    const matchingSkills = userSkills.filter(skill =>
        requiredSkills.some(reqSkill =>
            reqSkill.toLowerCase() === skill.toLowerCase()
        )
    );

    return (matchingSkills.length / requiredSkills.length) * 100;
}

/**
 * Calculate overall assignment score combining skill match and performance
 * @returns 0-100 score (higher is better)
 */
export function calculateAssignmentScore(
    user: User,
    requiredSkills: string[] = []
): number {
    const skillMatchScore = calculateSkillMatch(user.skills, requiredSkills);
    const performanceScore = user.reliabilityScore * 100; // Convert 0-1 to 0-100

    // Weight: 70% skill match, 30% performance
    // If no skills required, use 100% performance
    if (!requiredSkills || requiredSkills.length === 0) {
        return performanceScore;
    }

    return (skillMatchScore * 0.7) + (performanceScore * 0.3);
}

/**
 * Auto-assign task to the best matching user
 * @returns User ID of the best match
 */
export function autoAssignTask(
    task: Partial<Task>,
    availableUsers: User[]
): string {
    if (availableUsers.length === 0) {
        throw new Error('No available users for assignment');
    }

    const requiredSkills = task.requiredSkills || [];

    // Calculate scores for all users
    const userScores = availableUsers.map(user => ({
        userId: user.id,
        score: calculateAssignmentScore(user, requiredSkills),
        skillMatch: calculateSkillMatch(user.skills, requiredSkills),
        performance: user.reliabilityScore * 10 // 0-10 scale
    }));

    // Sort by score (highest first)
    userScores.sort((a, b) => b.score - a.score);

    // Return the best match
    return userScores[0].userId;
}

/**
 * Get skill match percentage for UI display
 * @returns Formatted percentage string
 */
export function getSkillMatchPercentage(
    userSkills: string[],
    requiredSkills: string[]
): number {
    return Math.round(calculateSkillMatch(userSkills, requiredSkills));
}

/**
 * Get detailed assignment recommendation
 */
export function getAssignmentRecommendation(
    user: User,
    requiredSkills: string[] = []
): {
    score: number;
    skillMatch: number;
    performance: number;
    matchingSkills: string[];
    missingSkills: string[];
} {
    const skillMatch = calculateSkillMatch(user.skills, requiredSkills);
    const score = calculateAssignmentScore(user, requiredSkills);

    const matchingSkills = user.skills.filter(skill =>
        requiredSkills.some(reqSkill =>
            reqSkill.toLowerCase() === skill.toLowerCase()
        )
    );

    const missingSkills = requiredSkills.filter(reqSkill =>
        !user.skills.some(skill =>
            skill.toLowerCase() === reqSkill.toLowerCase()
        )
    );

    return {
        score,
        skillMatch,
        performance: user.reliabilityScore * 10,
        matchingSkills,
        missingSkills
    };
}
