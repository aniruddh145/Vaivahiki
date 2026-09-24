// Samaj Vivah – database schema (Drizzle ORM, PostgreSQL)
// Localised text is stored as JSON: { "en": "...", "hi": "...", "gu": "..." }
import {
  pgTable, text, integer, boolean, timestamp, jsonb, doublePrecision, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { randomUUID } from "crypto";

export type L10n = Record<string, string>;
export type FieldOption = { value: string; label: L10n };

const id = () => text("id").primaryKey().$defaultFn(() => randomUUID().replace(/-/g, "").slice(0, 24));
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ───────────────────────── Users & auth ─────────────────────────

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").unique(),
  mobile: text("mobile").unique(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("USER"), // USER | MODERATOR | ADMIN
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | SUSPENDED | BANNED
  mobileVerified: boolean("mobile_verified").notNull().default(false),
  emailVerified: boolean("email_verified").notNull().default(false),
  lang: text("lang").notNull().default("en"),
  credits: integer("credits").notNull().default(0),
  billingName: text("billing_name"),
  billingAddress: text("billing_address"),
  billingState: text("billing_state"),
  gstin: text("gstin"),
  createdAt: createdAt(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
});

export const otps = pgTable("otps", {
  id: id(),
  target: text("target").notNull(),
  purpose: text("purpose").notNull(), // LOGIN | VERIFY | RESET
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("otp_target_idx").on(t.target, t.purpose)]);

// ───────────────────────── Configuration ─────────────────────────

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const languages = pgTable("languages", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  nativeName: text("native_name").notNull(),
  active: boolean("active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  order: integer("sort_order").notNull().default(0),
});

export const translations = pgTable("translations", {
  id: id(),
  lang: text("lang").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
}, (t) => [uniqueIndex("translation_lang_key").on(t.lang, t.key)]);

export const communities = pgTable("communities", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: jsonb("name").$type<L10n>().notNull(),
  description: jsonb("description").$type<L10n>(),
  codePrefix: text("code_prefix").notNull().default("SV"),
  active: boolean("active").notNull().default(true),
  order: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const fieldSections = pgTable("field_sections", {
  id: id(),
  key: text("key").notNull().unique(),
  label: jsonb("label").$type<L10n>().notNull(),
  order: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const fieldDefinitions = pgTable("field_definitions", {
  id: id(),
  key: text("key").notNull().unique(),
  sectionId: text("section_id").notNull().references(() => fieldSections.id, { onDelete: "cascade" }),
  // TEXT | TEXTAREA | NUMBER | SELECT | MULTISELECT | DATE | TIME | BOOLEAN | HEIGHT
  type: text("type").notNull(),
  label: jsonb("label").$type<L10n>().notNull(),
  placeholder: jsonb("placeholder").$type<L10n>(),
  helpText: jsonb("help_text").$type<L10n>(),
  options: jsonb("options").$type<FieldOption[]>(),
  required: boolean("required").notNull().default(false),
  // PUBLIC (anyone) | MEMBERS (logged in) | PREMIUM (after unlock) | PRIVATE (owner+admin)
  visibility: text("visibility").notNull().default("MEMBERS"),
  filterable: boolean("filterable").notNull().default(false),
  showInCard: boolean("show_in_card").notNull().default(false),
  min: doublePrecision("min"),
  max: doublePrecision("max"),
  communityIds: jsonb("community_ids").$type<string[] | null>(), // null = all communities
  order: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const reportReasons = pgTable("report_reasons", {
  id: id(),
  key: text("key").notNull().unique(),
  label: jsonb("label").$type<L10n>().notNull(),
  active: boolean("active").notNull().default(true),
  order: integer("sort_order").notNull().default(0),
});

// ───────────────────────── Profiles ─────────────────────────

export const profiles = pgTable("profiles", {
  id: id(),
  code: text("code").notNull().unique(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  communityId: text("community_id").notNull().references(() => communities.id),
  fullName: text("full_name").notNull(),
  gender: text("gender").notNull(), // MALE | FEMALE
  dateOfBirth: timestamp("date_of_birth", { mode: "date" }).notNull(),
  // DRAFT | PENDING | APPROVED | REJECTED | HIDDEN | MARRIED
  status: text("status").notNull().default("DRAFT"),
  rejectReason: text("reject_reason"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  photoVerified: boolean("photo_verified").notNull().default(false),
  featuredUntil: timestamp("featured_until", { withTimezone: true }),
  views: integer("views").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("profile_search_idx").on(t.status, t.gender, t.communityId)]);

export const photos = pgTable("photos", {
  id: id(),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  status: text("status").notNull().default("APPROVED"), // PENDING | APPROVED | REJECTED
  order: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const contacts = pgTable("contacts", {
  id: id(),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  relation: text("relation").notNull(), // SELF | FATHER | MOTHER | BROTHER | SISTER | UNCLE | RELATIVE | OTHER
  phone: text("phone"),
  email: text("email"),
  whatsapp: boolean("whatsapp").notNull().default(false),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: createdAt(),
});

export const profileViews = pgTable("profile_views", {
  id: id(),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  viewerId: text("viewer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("profile_view_unique").on(t.profileId, t.viewerId)]);

// ───────────────────────── Interactions ─────────────────────────

export const shortlists = pgTable("shortlists", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("BOOKMARK"), // BOOKMARK | WISHLIST
  createdAt: createdAt(),
}, (t) => [uniqueIndex("shortlist_unique").on(t.userId, t.profileId, t.kind)]);

export const interests = pgTable("interests", {
  id: id(),
  senderId: text("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fromProfileId: text("from_profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  toProfileId: text("to_profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  message: text("message"),
  status: text("status").notNull().default("SENT"), // SENT | ACCEPTED | DECLINED | WITHDRAWN
  creditsSpent: integer("credits_spent").notNull().default(0),
  createdAt: createdAt(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
}, (t) => [uniqueIndex("interest_unique").on(t.fromProfileId, t.toProfileId)]);

export const unlocks = pgTable("unlocks", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  creditsSpent: integer("credits_spent").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("unlock_unique").on(t.userId, t.profileId)]);

export const notifications = pgTable("notifications", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  message: text("message").notNull(),
  link: text("link"),
  read: boolean("read").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index("notification_user_idx").on(t.userId, t.read)]);

export const reports = pgTable("reports", {
  id: id(),
  reporterId: text("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  reasonKey: text("reason_key").notNull(),
  details: text("details"),
  status: text("status").notNull().default("OPEN"), // OPEN | ACTIONED | DISMISSED
  adminNote: text("admin_note"),
  createdAt: createdAt(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const feedbacks = pgTable("feedbacks", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  interaction: text("interaction"), // CALLED | MET | CHATTED | NO_RESPONSE
  comment: text("comment"),
  hidden: boolean("hidden").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("feedback_unique").on(t.userId, t.profileId)]);

export const photoVerifications = pgTable("photo_verifications", {
  id: id(),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  selfieUrl: text("selfie_url").notNull(),
  status: text("status").notNull().default("PENDING"), // PENDING | APPROVED | REJECTED
  provider: text("provider").notNull().default("manual"),
  score: doublePrecision("score"),
  reviewerId: text("reviewer_id"),
  note: text("note"),
  createdAt: createdAt(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

// ───────────────────────── Money ─────────────────────────

export const creditPackages = pgTable("credit_packages", {
  id: id(),
  name: jsonb("name").$type<L10n>().notNull(),
  description: jsonb("description").$type<L10n>(),
  credits: integer("credits").notNull(),
  pricePaise: integer("price_paise").notNull(), // ₹500 = 50000
  validityDays: integer("validity_days"),
  highlight: boolean("highlight").notNull().default(false),
  active: boolean("active").notNull().default(true),
  order: integer("sort_order").notNull().default(0),
});

export const paymentOrders = pgTable("payment_orders", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  packageId: text("package_id").notNull().references(() => creditPackages.id),
  packageName: text("package_name").notNull(),
  credits: integer("credits").notNull(),
  taxablePaise: integer("taxable_paise").notNull(),
  cgstPaise: integer("cgst_paise").notNull().default(0),
  sgstPaise: integer("sgst_paise").notNull().default(0),
  igstPaise: integer("igst_paise").notNull().default(0),
  totalPaise: integer("total_paise").notNull(),
  gateway: text("gateway").notNull(),
  gatewayOrderId: text("gateway_order_id"),
  gatewayPaymentId: text("gateway_payment_id"),
  status: text("status").notNull().default("CREATED"), // CREATED | PAID | FAILED | REFUNDED
  billingState: text("billing_state"),
  meta: jsonb("meta"),
  createdAt: createdAt(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

export const invoices = pgTable("invoices", {
  id: id(),
  number: text("number").notNull().unique(),
  orderId: text("order_id").notNull().unique().references(() => paymentOrders.id),
  userId: text("user_id").notNull().references(() => users.id),
  billingName: text("billing_name").notNull(),
  billingAddress: text("billing_address"),
  billingState: text("billing_state"),
  gstin: text("gstin"),
  description: text("description").notNull(),
  sacCode: text("sac_code"),
  taxablePaise: integer("taxable_paise").notNull(),
  cgstPaise: integer("cgst_paise").notNull(),
  sgstPaise: integer("sgst_paise").notNull(),
  igstPaise: integer("igst_paise").notNull(),
  totalPaise: integer("total_paise").notNull(),
  financialYear: text("financial_year").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  seller: jsonb("seller").$type<Record<string, string>>().notNull(),
});

export const creditLedger = pgTable("credit_ledger", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  // PURCHASE | UNLOCK_CONTACT | SEND_INTEREST | ADMIN_ADJUST | REFUND | SIGNUP_BONUS
  reason: text("reason").notNull(),
  refId: text("ref_id"),
  note: text("note"),
  actorId: text("actor_id"),
  createdAt: createdAt(),
}, (t) => [index("ledger_user_idx").on(t.userId, t.createdAt)]);

export const counters = pgTable("counters", {
  name: text("name").primaryKey(),
  value: integer("value").notNull().default(0),
});

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  data: jsonb("data"),
  createdAt: createdAt(),
}, (t) => [index("audit_created_idx").on(t.createdAt)]);

export type User = typeof users.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type FieldDef = typeof fieldDefinitions.$inferSelect;
export type Community = typeof communities.$inferSelect;
export type CreditPackage = typeof creditPackages.$inferSelect;

// ───────────────────────── Success stories ─────────────────────────

export const stories = pgTable("stories", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  // the other half, if they also registered on the app
  partnerProfileId: text("partner_profile_id").references(() => profiles.id, { onDelete: "set null" }),
  partnerConfirmed: boolean("partner_confirmed").notNull().default(false),
  coupleNames: text("couple_names").notNull(),
  weddingDate: text("wedding_date"),
  city: text("city"),
  message: text("message"),
  photos: jsonb("photos").$type<string[]>().notNull().default([]),
  visibility: text("visibility").notNull().default("MEMBERS"), // MEMBERS | PUBLIC
  // AWAITING_PARTNER | PENDING (admin) | PUBLISHED | FLAGGED (auto-hidden) | REMOVED
  status: text("status").notNull().default("PENDING"),
  flagReason: text("flag_reason"),
  reportCount: integer("report_count").notNull().default(0),
  congratsCount: integer("congrats_count").notNull().default(0),
  commentCount: integer("comment_count").notNull().default(0),
  createdAt: createdAt(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (t) => [index("story_status_idx").on(t.status, t.createdAt)]);

export const storyCongrats = pgTable("story_congrats", {
  id: id(),
  storyId: text("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("story_congrats_unique").on(t.storyId, t.userId)]);

export const storyComments = pgTable("story_comments", {
  id: id(),
  storyId: text("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  status: text("status").notNull().default("PUBLISHED"), // PUBLISHED | FLAGGED | REMOVED
  flagReason: text("flag_reason"),
  reportCount: integer("report_count").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [index("story_comment_idx").on(t.storyId, t.createdAt)]);

// who reported which story/comment (one report per member per item)
export const contentReports = pgTable("content_reports", {
  id: id(),
  targetType: text("target_type").notNull(), // STORY | COMMENT
  targetId: text("target_id").notNull(),
  reporterId: text("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("content_report_unique").on(t.targetType, t.targetId, t.reporterId)]);

export type Story = typeof stories.$inferSelect;
