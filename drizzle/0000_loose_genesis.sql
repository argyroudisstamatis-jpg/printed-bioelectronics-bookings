CREATE TABLE `bookings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`booking_date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`title` text NOT NULL,
	`equipment` text NOT NULL,
	`owner_id` text NOT NULL,
	`owner_name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_bookings_date` ON `bookings` (`booking_date`);--> statement-breakpoint
CREATE INDEX `idx_bookings_equipment_date` ON `bookings` (`equipment`,`booking_date`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`tag` text DEFAULT '#lab-notes' NOT NULL,
	`author_id` text NOT NULL,
	`author_email` text NOT NULL,
	`author_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_notes_updated_at` ON `notes` (`updated_at`);