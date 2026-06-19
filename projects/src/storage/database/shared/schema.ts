import { pgTable, varchar, text, integer, timestamp, serial, jsonb, boolean, unique, index, foreignKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

const gen_random_uuid = sql`gen_random_uuid()`


export const learningMaterials = pgTable("learning_materials", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	taskId: varchar("task_id", { length: 36 }).notNull(),
	title: varchar({ length: 200 }).notNull(),
	content: text(),
	type: varchar({ length: 20 }).notNull(),
	url: varchar({ length: 500 }),
	orderIndex: integer("order_index").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

// 小队学习资料完成记录
export const teamMaterialProgress = pgTable("team_material_progress", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	materialId: varchar("material_id", { length: 36 }).notNull(),
	taskId: varchar("task_id", { length: 36 }),
	status: varchar({ length: 20 }).default('not_started'), // not_started, in_progress, completed
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_team_material_progress_team_id").using("btree", table.teamId.asc().nullsLast().op("text_ops")),
	index("idx_team_material_progress_task_id").using("btree", table.taskId.asc().nullsLast().op("text_ops")),
	unique("team_material_progress_team_id_material_id_task_id_key").on(table.teamId, table.materialId, table.taskId),
]);

export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const taskSubmissions = pgTable("task_submissions", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	taskId: varchar("task_id", { length: 36 }).notNull(),
	content: text(),
	fileUrls: jsonb("file_urls"),
	status: varchar({ length: 20 }).default('pending'),
	reviewComment: text("review_comment"),
	reviewerId: varchar("reviewer_id", { length: 36 }),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	rating: varchar({ length: 20 }),
});

export const taskThemes = pgTable("task_themes", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	icon: varchar({ length: 255 }),
	orderIndex: integer("order_index").default(0),
	isActive: boolean("is_active").default(true),
	schoolId: varchar("school_id", { length: 36 }),
	createdBy: varchar("created_by", { length: 36 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	selectedByTeamId: varchar("selected_by_team_id", { length: 36 }),
	isExclusive: boolean("is_exclusive").default(false),
});

export const teamMembers = pgTable("team_members", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	name: varchar({ length: 50 }).notNull(),
	role: varchar({ length: 20 }).default('member').notNull(),
	isApproved: boolean("is_approved").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	intro: varchar({ length: 200 }),
});

export const userRewards = pgTable("user_rewards", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	rewardId: varchar("reward_id", { length: 36 }).notNull(),
	taskId: varchar("task_id", { length: 36 }),
	earnedAt: timestamp("earned_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

// 小队支线任务表
export const teamSideTasks = pgTable("team_side_tasks", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	taskId: varchar("task_id", { length: 36 }).notNull(),
	assignedBy: varchar("assigned_by", { length: 36 }), // 分配人（志愿者ID）
	assignedAt: timestamp("assigned_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	status: varchar({ length: 20 }).default('assigned'), // assigned, in_progress, completed
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
});

export const tasks = pgTable("tasks", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	themeId: varchar("theme_id", { length: 36 }).notNull(),
	stage: integer().notNull(),
	title: varchar({ length: 200 }).notNull(),
	description: text(),
	requirements: jsonb(),
	learningGoals: jsonb("learning_goals"),
	points: integer().default(10),
	orderIndex: integer("order_index").default(0),
	isActive: boolean("is_active").default(true),
	taskType: varchar("task_type", { length: 20 }).default('main'),
	createdBy: varchar("created_by", { length: 36 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
});

export const users = pgTable("users", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	username: varchar({ length: 50 }).notNull(),
	password: varchar({ length: 255 }).notNull(),
	name: varchar({ length: 100 }),
	role: varchar({ length: 20 }).default('team').notNull(),
	schoolId: varchar("school_id", { length: 36 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	assignedTeacherId: varchar("assigned_teacher_id", { length: 36 }),
	grade: varchar({ length: 20 }),
	className: varchar("class_name", { length: 50 }),
	studentCount: integer("student_count"),
	gradeClasses: jsonb("grade_classes"),
}, (table) => [
	unique("users_username_unique").on(table.username),
]);

export const taskTools = pgTable("task_tools", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	taskId: varchar("task_id", { length: 36 }).notNull(),
	toolId: varchar("tool_id", { length: 36 }).notNull(),
	isRequired: boolean("is_required").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_task_tools_task_id").using("btree", table.taskId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.toolId],
			foreignColumns: [tools.id],
			name: "task_tools_tool_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [tasks.id],
			name: "task_tools_task_id_fkey"
		}).onDelete("cascade"),
	unique("task_tools_task_id_tool_id_key").on(table.taskId, table.toolId),
]);

export const tools = pgTable("tools", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	icon: varchar({ length: 255 }),
	category: varchar({ length: 50 }),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	imageUrl: varchar("image_url", { length: 500 }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	stock: integer(),
	nature: varchar("nature", { length: 20 }).default('physical'), // physical: 实物, virtual: 虚拟
	teamLimit: integer("team_limit"), // 每个小队可领用的最大数量
	needsReturn: boolean("needs_return").default(true), // 是否需要还回，实物工具默认需要还回
});

export const taskSkills = pgTable("task_skills", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	taskId: varchar("task_id", { length: 36 }).notNull(),
	skillId: varchar("skill_id", { length: 36 }).notNull(),
	points: integer().default(5),
	isRequired: boolean("is_required").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_task_skills_task_id").using("btree", table.taskId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [tasks.id],
			name: "task_skills_task_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.skillId],
			foreignColumns: [skills.id],
			name: "task_skills_skill_id_fkey"
		}).onDelete("cascade"),
	unique("task_skills_task_id_skill_id_key").on(table.taskId, table.skillId),
]);

export const teamSkillLearnings = pgTable("team_skill_learnings", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	skillId: varchar("skill_id", { length: 36 }).notNull(),
	taskId: varchar("task_id", { length: 36 }),
	status: varchar({ length: 20 }).default('not_started'),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	pointsEarned: integer("points_earned").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_team_skill_learnings_team_id").using("btree", table.teamId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "team_skill_learnings_team_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.skillId],
			foreignColumns: [skills.id],
			name: "team_skill_learnings_skill_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [tasks.id],
			name: "team_skill_learnings_task_id_fkey"
		}).onDelete("cascade"),
	unique("team_skill_learnings_team_id_skill_id_task_id_key").on(table.teamId, table.skillId, table.taskId),
]);

export const teams = pgTable("teams", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	code: varchar({ length: 20 }).notNull(),
	password: varchar({ length: 255 }).notNull(),
	name: varchar({ length: 100 }),
	slogan: varchar({ length: 200 }), // 小队口号
	schoolId: varchar("school_id", { length: 36 }),
	currentThemeId: varchar("current_theme_id", { length: 36 }),
	currentTaskId: varchar("current_task_id", { length: 36 }),
	status: varchar({ length: 20 }).default('active'),
	points: integer().default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	rules: text(),
	grade: varchar({ length: 20 }),
	teacherId: varchar("teacher_id", { length: 36 }),
	createdBy: varchar("created_by", { length: 36 }),
}, (table) => [
	unique("teams_code_unique").on(table.code),
]);

export const skills = pgTable("skills", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	icon: varchar({ length: 255 }),
	category: varchar({ length: 50 }),
	content: text(),
	videoUrl: varchar("video_url", { length: 500 }),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	usage: text(),
	learningMaterials: jsonb("learning_materials"),
});

export const toolSkills = pgTable("tool_skills", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	toolId: varchar("tool_id", { length: 36 }).notNull(),
	skillId: varchar("skill_id", { length: 36 }).notNull(),
	isAutoAdd: boolean("is_auto_add").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_tool_skills_skill_id").using("btree", table.skillId.asc().nullsLast().op("text_ops")),
	index("idx_tool_skills_tool_id").using("btree", table.toolId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.toolId],
			foreignColumns: [tools.id],
			name: "tool_skills_tool_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.skillId],
			foreignColumns: [skills.id],
			name: "tool_skills_skill_id_fkey"
		}).onDelete("cascade"),
	unique("tool_skills_tool_id_skill_id_key").on(table.toolId, table.skillId),
]);

export const rewards = pgTable("rewards", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	icon: varchar({ length: 255 }),
	points: integer().default(0),
	type: varchar({ length: 20 }).notNull(),
	requirement: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	conditions: jsonb(),
	conditionLogic: varchar("condition_logic", { length: 10 }).default('and'),
	imageUrl: varchar("image_url", { length: 500 }),
	distributionMethod: varchar("distribution_method", { length: 20 }).default('auto'), // auto: 自动获得, manual: 志愿者分配
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
});

export const schools = pgTable("schools", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	name: varchar({ length: 200 }).notNull(),
	address: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	teacherName: varchar("teacher_name", { length: 100 }),
	teacherPhone: varchar("teacher_phone", { length: 20 }),
	province: varchar({ length: 50 }),
	city: varchar({ length: 50 }),
	county: varchar({ length: 50 }),
});

export const messages = pgTable("messages", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	senderId: varchar("sender_id", { length: 36 }),
	receiverId: varchar("receiver_id", { length: 36 }),
	teamId: varchar("team_id", { length: 36 }),
	content: text().notNull(),
	type: varchar({ length: 20 }).notNull(),
	isRead: boolean("is_read").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	contentType: varchar("content_type", { length: 20 }).default('text'),
	mediaUrl: varchar("media_url", { length: 500 }),
});

export const themeSchools = pgTable("theme_schools", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	themeId: varchar("theme_id", { length: 36 }).notNull(),
	schoolId: varchar("school_id", { length: 36 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("theme_schools_theme_id_school_id_key").on(table.themeId, table.schoolId),
]);

export const taskRewards = pgTable("task_rewards", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	taskId: varchar("task_id", { length: 36 }).notNull(),
	rewardId: varchar("reward_id", { length: 36 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("task_rewards_task_id_reward_id_key").on(table.taskId, table.rewardId),
]);

// 小队通知表
export const teamNotifications = pgTable("team_notifications", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	type: varchar({ length: 30 }).notNull(), // submission_feedback, volunteer_message, reward_earned, system, side_task
	title: varchar({ length: 200 }).notNull(),
	content: text().notNull(),
	isRead: boolean("is_read").default(false),
	// 关联数据
	submissionId: varchar("submission_id", { length: 36 }),
	taskId: varchar("task_id", { length: 36 }),
	rewardId: varchar("reward_id", { length: 36 }),
	senderId: varchar("sender_id", { length: 36 }), // 发送人（志愿者ID）
	senderName: varchar("sender_name", { length: 100 }), // 发送人名称
	// 额外数据
	extraData: jsonb("extra_data"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_team_notifications_team_id").using("btree", table.teamId.asc().nullsLast().op("text_ops")),
	index("idx_team_notifications_is_read").using("btree", table.isRead.asc().nullsLast().op("text_ops")),
]);

export const schoolTools = pgTable("school_tools", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	schoolId: varchar("school_id", { length: 36 }).notNull(),
	toolId: varchar("tool_id", { length: 36 }).notNull(),
	stock: integer().default(0),
	used: integer().default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_school_tools_school_id").using("btree", table.schoolId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.schoolId],
			foreignColumns: [schools.id],
			name: "school_tools_school_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.toolId],
			foreignColumns: [tools.id],
			name: "school_tools_tool_id_fkey"
		}).onDelete("cascade"),
	unique("school_tools_school_id_tool_id_key").on(table.schoolId, table.toolId),
]);

export const teamTools = pgTable("team_tools", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	taskId: varchar("task_id", { length: 36 }).notNull(),
	toolId: varchar("tool_id", { length: 36 }).notNull(),
	selectedAt: timestamp("selected_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_team_tools_team_id").using("btree", table.teamId.asc().nullsLast().op("text_ops")),
	index("idx_team_tools_task_id").using("btree", table.taskId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "team_tools_team_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [tasks.id],
			name: "team_tools_task_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.toolId],
			foreignColumns: [tools.id],
			name: "team_tools_tool_id_fkey"
		}).onDelete("cascade"),
	unique("team_tools_team_id_task_id_tool_id_key").on(table.teamId, table.taskId, table.toolId),
]);
