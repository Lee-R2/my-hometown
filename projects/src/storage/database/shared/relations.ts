import { relations } from "drizzle-orm/relations";
import { tools, taskTools, tasks, taskSkills, skills, teams, teamSkillLearnings, toolSkills } from "./schema";

export const taskToolsRelations = relations(taskTools, ({one}) => ({
	tool: one(tools, {
		fields: [taskTools.toolId],
		references: [tools.id]
	}),
	task: one(tasks, {
		fields: [taskTools.taskId],
		references: [tasks.id]
	}),
}));

export const toolsRelations = relations(tools, ({many}) => ({
	taskTools: many(taskTools),
	toolSkills: many(toolSkills),
}));

export const tasksRelations = relations(tasks, ({many}) => ({
	taskTools: many(taskTools),
	taskSkills: many(taskSkills),
	teamSkillLearnings: many(teamSkillLearnings),
}));

export const taskSkillsRelations = relations(taskSkills, ({one}) => ({
	task: one(tasks, {
		fields: [taskSkills.taskId],
		references: [tasks.id]
	}),
	skill: one(skills, {
		fields: [taskSkills.skillId],
		references: [skills.id]
	}),
}));

export const skillsRelations = relations(skills, ({many}) => ({
	taskSkills: many(taskSkills),
	teamSkillLearnings: many(teamSkillLearnings),
	toolSkills: many(toolSkills),
}));

export const teamSkillLearningsRelations = relations(teamSkillLearnings, ({one}) => ({
	team: one(teams, {
		fields: [teamSkillLearnings.teamId],
		references: [teams.id]
	}),
	skill: one(skills, {
		fields: [teamSkillLearnings.skillId],
		references: [skills.id]
	}),
	task: one(tasks, {
		fields: [teamSkillLearnings.taskId],
		references: [tasks.id]
	}),
}));

export const teamsRelations = relations(teams, ({many}) => ({
	teamSkillLearnings: many(teamSkillLearnings),
}));

export const toolSkillsRelations = relations(toolSkills, ({one}) => ({
	tool: one(tools, {
		fields: [toolSkills.toolId],
		references: [tools.id]
	}),
	skill: one(skills, {
		fields: [toolSkills.skillId],
		references: [skills.id]
	}),
}));