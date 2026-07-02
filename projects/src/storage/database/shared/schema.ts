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
	sourceTradeId: varchar("source_trade_id", { length: 36 }), // 云朵市集交易复制来源
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
	// 以下为代码中使用但原 schema 缺失的字段
	isActive: boolean("is_active").default(true),
	lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: 'string' }),
	lastLoginIp: text("last_login_ip"),
	assignedVolunteerId: varchar("assigned_volunteer_id", { length: 36 }),
	cycle: integer().default(1),
	hasCompletedPretest: boolean("has_completed_pretest").default(false),
	heartShards: integer("heart_shards").default(0),
	heartGems: integer("heart_gems").default(0),
	icon: varchar({ length: 255 }),
	description: text(),
	nextTaskDeadline: timestamp("next_task_deadline", { withTimezone: true, mode: 'string' }),
	preferredDifficulty: varchar("preferred_difficulty", { length: 20 }),
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

// ============================================
// 以下为代码中使用但原 schema 缺失的表定义
// ============================================

// 积分借贷表
export const pointBorrows = pgTable("point_borrows", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	borrowerId: varchar("borrower_id", { length: 36 }).notNull(),
	lenderId: varchar("lender_id", { length: 36 }).notNull(),
	points: integer().notNull(),
	interestRate: varchar("interest_rate", { length: 10 }).default('0'),
	overdueInterestRate: varchar("overdue_interest_rate", { length: 10 }).default('0'),
	repayDate: timestamp("repay_date", { withTimezone: true, mode: 'string' }),
	status: varchar({ length: 20 }).default('pending'), // pending, approved, rejected, repaid, overdue, partial_repaid
	message: text(),
	rejectionReason: text("rejection_reason"),
	requestedAt: timestamp("requested_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	approvedAt: timestamp("approved_at", { withTimezone: true, mode: 'string' }),
	repaidAt: timestamp("repaid_at", { withTimezone: true, mode: 'string' }),
	actualPoints: integer("actual_points").default(0),
	unpaidPoints: integer("unpaid_points").default(0),
	autoRepaid: boolean("auto_repaid").default(false),
}, (table) => [
	index("idx_point_borrows_borrower_id").using("btree", table.borrowerId.asc().nullsLast().op("text_ops")),
	index("idx_point_borrows_lender_id").using("btree", table.lenderId.asc().nullsLast().op("text_ops")),
	index("idx_point_borrows_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

// 积分交易记录表
export const pointTransactions = pgTable("point_transactions", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }),
	fromTeamId: varchar("from_team_id", { length: 36 }),
	toTeamId: varchar("to_team_id", { length: 36 }),
	relatedId: varchar("related_id", { length: 36 }),
	points: integer().notNull(),
	type: varchar({ length: 20 }),
	changeType: varchar("change_type", { length: 30 }).notNull(),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_point_transactions_team_id").using("btree", table.teamId.asc().nullsLast().op("text_ops")),
	index("idx_point_transactions_change_type").using("btree", table.changeType.asc().nullsLast().op("text_ops")),
]);

// 小队主题选择表
export const teamThemeSelections = pgTable("team_theme_selections", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	themeId: varchar("theme_id", { length: 36 }).notNull(),
	status: varchar({ length: 20 }).default('in_progress'), // in_progress, completed, abandoned
	cycle: integer().default(1),
	selectedAt: timestamp("selected_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_team_theme_selections_team_id").using("btree", table.teamId.asc().nullsLast().op("text_ops")),
	index("idx_team_theme_selections_theme_id").using("btree", table.themeId.asc().nullsLast().op("text_ops")),
]);

// 黑板报帖子表
export const blackboardPosts = pgTable("blackboard_posts", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	themeId: varchar("theme_id", { length: 36 }),
	title: varchar({ length: 200 }).notNull(),
	content: text().notNull(),
	imagesUrl: jsonb("images_url"),
	status: varchar({ length: 20 }).default('pending'), // pending, approved, rejected
	rejectionReason: text("rejection_reason"),
	likesCount: integer("likes_count").default(0),
	commentsCount: integer("comments_count").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_blackboard_posts_team_id").using("btree", table.teamId.asc().nullsLast().op("text_ops")),
	index("idx_blackboard_posts_theme_id").using("btree", table.themeId.asc().nullsLast().op("text_ops")),
	index("idx_blackboard_posts_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

// 黑板报评论表
export const blackboardComments = pgTable("blackboard_comments", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	postId: varchar("post_id", { length: 36 }).notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	content: text().notNull(),
	likesCount: integer("likes_count").default(0),
	status: varchar({ length: 20 }).default('approved'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_blackboard_comments_post_id").using("btree", table.postId.asc().nullsLast().op("text_ops")),
	index("idx_blackboard_comments_team_id").using("btree", table.teamId.asc().nullsLast().op("text_ops")),
]);

// 黑板报点赞表
export const blackboardLikes = pgTable("blackboard_likes", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	postId: varchar("post_id", { length: 36 }).notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("blackboard_likes_post_id_team_id_key").on(table.postId, table.teamId),
]);

// 用户会话表
export const userSessions = pgTable("user_sessions", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	userId: text("user_id").notNull(),
	token: text().notNull(),
	csrfToken: text("csrf_token").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	unique("user_sessions_token_unique").on(table.token),
]);

// 家长账号表
export const parentAccounts = pgTable("parent_accounts", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	phone: varchar({ length: 20 }).notNull(),
	password: varchar({ length: 255 }).notNull(),
	name: varchar({ length: 100 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	unique("parent_accounts_phone_unique").on(table.phone),
]);

// 家长-小队关联表
export const parentTeamRelations = pgTable("parent_team_relations", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	parentId: varchar("parent_id", { length: 36 }).notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	relation: varchar({ length: 20 }), // 父亲、母亲等
	status: varchar({ length: 20 }).default('pending'), // pending, approved, rejected
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	approvedAt: timestamp("approved_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_parent_team_relations_parent_id").using("btree", table.parentId.asc().nullsLast().op("text_ops")),
	index("idx_parent_team_relations_team_id").using("btree", table.teamId.asc().nullsLast().op("text_ops")),
]);

// 智能体会话表
export const agentSessions = pgTable("agent_sessions", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	agentType: varchar("agent_type", { length: 50 }).notNull(),
	status: varchar({ length: 20 }).default('active'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_agent_sessions_team_id").using("btree", table.teamId.asc().nullsLast().op("text_ops")),
]);

// 智能体对话表
export const agentConversations = pgTable("agent_conversations", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	sessionId: varchar("session_id", { length: 36 }).notNull(),
	role: varchar({ length: 20 }).notNull(), // user, assistant, system
	content: text().notNull(),
	messageType: varchar("message_type", { length: 20 }).default('text'),
	mediaUrl: varchar("media_url", { length: 500 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_agent_conversations_session_id").using("btree", table.sessionId.asc().nullsLast().op("text_ops")),
]);

// 智能体记忆表
export const agentMemories = pgTable("agent_memories", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	agentType: varchar("agent_type", { length: 50 }).notNull(),
	memoryType: varchar("memory_type", { length: 30 }),
	content: text().notNull(),
	importance: integer().default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_agent_memories_team_id").using("btree", table.teamId.asc().nullsLast().op("text_ops")),
]);

// 小队活动日志表
export const teamActivityLogs = pgTable("team_activity_logs", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	action: varchar({ length: 50 }).notNull(),
	details: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_team_activity_logs_team_id").using("btree", table.teamId.asc().nullsLast().op("text_ops")),
]);

// 最终任务表单表
export const finalTaskForms = pgTable("final_task_forms", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	themeId: varchar("theme_id", { length: 36 }),
	title: varchar({ length: 200 }).notNull(),
	description: text(),
	role: varchar({ length: 20 }), // guider, light_mage, secret_scholar
	fields: jsonb().notNull(),
	schoolId: varchar("school_id", { length: 36 }),
	isGlobal: boolean("is_global").default(true),
	isActive: boolean("is_active").default(true),
	icon: varchar({ length: 10 }).default('🏆'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
});

// 最终任务提交表
export const finalTaskSubmissions = pgTable("final_task_submissions", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	taskId: varchar("task_id", { length: 36 }),
	memberId: varchar("member_id", { length: 36 }),
	memberRole: varchar("member_role", { length: 20 }),
	formData: jsonb("form_data"),
	cycle: integer().default(1),
	status: varchar({ length: 20 }).default('pending'),
	reviewComment: text("review_comment"),
	reviewerId: varchar("reviewer_id", { length: 36 }),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_final_task_submissions_team_task").using("btree", table.teamId.asc().nullsLast().op("text_ops")),
]);

// 小队难度偏好表
export const teamDifficultyPreferences = pgTable("team_difficulty_preferences", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	preferredDifficulty: varchar("preferred_difficulty", { length: 20 }).notNull(),
	cycle: integer().default(1),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	unique("team_difficulty_preferences_team_id_cycle_key").on(table.teamId, table.cycle),
]);

// 小队预测试表
export const teamPretests = pgTable("team_pretests", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	cycle: integer().default(1),
	score: integer().default(0),
	answers: jsonb(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("team_pretests_team_id_cycle_key").on(table.teamId, table.cycle),
]);

// 爱心宝石表
export const heartGems = pgTable("heart_gems", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	amount: integer().default(0),
	reason: varchar({ length: 200 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_heart_gems_team_id").using("btree", table.teamId.asc().nullsLast().op("text_ops")),
]);

// 任务反馈知识库表
export const taskFeedbackKnowledge = pgTable("task_feedback_knowledge", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	taskId: varchar("task_id", { length: 36 }).notNull(),
	themeId: varchar("theme_id", { length: 36 }),
	keywords: text().notNull(),
	feedback: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

// ===== 云朵市集 =====
export const cloudMarketListings = pgTable("cloud_market_listings", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	listingType: varchar("listing_type", { length: 20 }).notNull(),
	itemType: varchar("item_type", { length: 20 }).notNull(),
	itemRef: varchar("item_ref", { length: 36 }),
	itemName: varchar("item_name", { length: 200 }).notNull(),
	itemDescription: text("item_description"),
	itemImageUrl: varchar("item_image_url", { length: 500 }),
	quantity: integer().notNull().default(1),
	availableQuantity: integer("available_quantity").notNull(),
	price: integer(),
	barterFor: jsonb("barter_for"),
	scope: varchar({ length: 20 }).notNull(),
	themeId: varchar("theme_id", { length: 36 }),
	schoolId: varchar("school_id", { length: 36 }),
	status: varchar({ length: 20 }).notNull().default('active'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_cloud_market_listings_team_id").using("btree", table.teamId.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_listings_scope_theme").using("btree", table.scope.asc().nullsLast().op("text_ops"), table.themeId.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_listings_scope_school").using("btree", table.scope.asc().nullsLast().op("text_ops"), table.schoolId.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_listings_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_listings_item_type").using("btree", table.itemType.asc().nullsLast().op("text_ops")),
]);

export const cloudMarketOffers = pgTable("cloud_market_offers", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	listingId: varchar("listing_id", { length: 36 }).notNull(),
	fromTeamId: varchar("from_team_id", { length: 36 }).notNull(),
	offerType: varchar("offer_type", { length: 20 }).notNull(),
	offerPrice: integer("offer_price"),
	offerItemType: varchar("offer_item_type", { length: 20 }),
	offerItemRef: varchar("offer_item_ref", { length: 36 }),
	offerItemName: varchar("offer_item_name", { length: 200 }),
	offerQuantity: integer("offer_quantity").default(1),
	status: varchar({ length: 20 }).notNull().default('pending'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	respondedAt: timestamp("responded_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_cloud_market_offers_listing_id").using("btree", table.listingId.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_offers_from_team").using("btree", table.fromTeamId.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_offers_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

export const cloudMarketTrades = pgTable("cloud_market_trades", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	listingId: varchar("listing_id", { length: 36 }).notNull(),
	buyerTeamId: varchar("buyer_team_id", { length: 36 }).notNull(),
	sellerTeamId: varchar("seller_team_id", { length: 36 }).notNull(),
	tradeType: varchar("trade_type", { length: 20 }).notNull(),
	itemType: varchar("item_type", { length: 20 }).notNull(),
	itemName: varchar("item_name", { length: 200 }).notNull(),
	quantity: integer().notNull(),
	pointsPaid: integer("points_paid").default(0),
	barterItemType: varchar("barter_item_type", { length: 20 }),
	barterItemName: varchar("barter_item_name", { length: 200 }),
	barterQuantity: integer("barter_quantity"),
	scope: varchar({ length: 20 }).notNull(),
	themeId: varchar("theme_id", { length: 36 }),
	schoolId: varchar("school_id", { length: 36 }),
	offerId: varchar("offer_id", { length: 36 }),
	status: varchar({ length: 20 }).notNull().default('completed'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_cloud_market_trades_listing_id").using("btree", table.listingId.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_trades_buyer").using("btree", table.buyerTeamId.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_trades_seller").using("btree", table.sellerTeamId.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_trades_scope").using("btree", table.scope.asc().nullsLast().op("text_ops"), table.themeId.asc().nullsLast().op("text_ops"), table.schoolId.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_trades_created_at").using("btree", table.createdAt.asc().nullsLast().op("text_ops")),
]);
