import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const notes = sqliteTable('notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  body: text('body').notNull(),
  tag: text('tag').notNull().default('#lab-notes'),
  authorId: text('author_id').notNull(),
  authorEmail: text('author_email').notNull(),
  authorName: text('author_name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  updatedAtIdx: index('idx_notes_updated_at').on(table.updatedAt),
}));

export const bookings = sqliteTable('bookings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  bookingDate: text('booking_date').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  title: text('title').notNull(),
  equipment: text('equipment').notNull(),
  ownerId: text('owner_id').notNull(),
  ownerName: text('owner_name').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  dateIdx: index('idx_bookings_date').on(table.bookingDate),
  equipmentDateIdx: index('idx_bookings_equipment_date').on(table.equipment, table.bookingDate),
}));
