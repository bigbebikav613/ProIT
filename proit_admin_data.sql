-- PRO IT Landing / Admin database schema
-- UTF-8
-- This file stores the admin data outside frontend JS.

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS site_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  source TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brand (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  school_name TEXT NOT NULL,
  hero_title TEXT NOT NULL,
  hero_subtitle TEXT,
  tagline TEXT,
  primary_cta TEXT,
  secondary_cta TEXT
);

CREATE TABLE IF NOT EXISTS about (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  lead TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS about_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  point_text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS enrollment (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  age_info TEXT,
  duration TEXT,
  formats TEXT
);

CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  role TEXT,
  bio TEXT,
  photo TEXT
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  age_category TEXT,
  short_description TEXT,
  full_description TEXT,
  duration TEXT,
  teacher_id TEXT,
  image TEXT,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS course_formats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id TEXT NOT NULL,
  format TEXT NOT NULL,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gallery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  title TEXT,
  caption TEXT,
  post_url TEXT
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  author TEXT,
  role TEXT,
  text TEXT
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  address TEXT,
  phone TEXT,
  email TEXT,
  vk TEXT,
  telegram TEXT,
  map_embed TEXT
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  course_id TEXT,
  course_title TEXT,
  full_name TEXT,
  phone TEXT,
  format TEXT,
  comment TEXT
);

-- Seed (minimal)
INSERT OR REPLACE INTO site_meta (id, source, updated_at)
VALUES (1, 'vk.com/proittaganrog', datetime('now'));

INSERT OR REPLACE INTO brand (id, school_name, hero_title, hero_subtitle, tagline, primary_cta, secondary_cta)
VALUES (
  1,
  'Школа ПРО IT',
  'Школа ПРО IT Таганрог',
  'Проектная IT-школа на базе ИКТИБ ЮФУ для школьников от 12 лет и студентов СПО.',
  'Создадим крутой IT-проект вместе!',
  'Записаться на обучение',
  'Смотреть курсы'
);

INSERT OR REPLACE INTO about (id, lead, description)
VALUES (
  1,
  'Школа ПРО IT — это занятия по проектной деятельности для школьников и студентов СПО на базе ИКТИБ ЮФУ.',
  'С 2021 года школа помогает начинающим войти в IT с нуля: участники изучают инструменты разработки, собираются в команды и доводят идеи до реальных работающих проектов.'
);

DELETE FROM about_points;
INSERT INTO about_points (sort_order, point_text) VALUES
  (10, 'Очный и онлайн форматы обучения'),
  (20, 'Практика с наставниками из ИКТИБ ЮФУ'),
  (30, 'Командные и индивидуальные проекты'),
  (40, 'Подготовка к защитам, олимпиадам и хакатонам'),
  (50, 'Сертификат по итогам обучения');

INSERT OR REPLACE INTO enrollment (id, age_info, duration, formats)
VALUES (1, 'Для школьников 12+ и студентов СПО', '6 месяцев', 'Очно и онлайн');

INSERT OR REPLACE INTO contacts (id, address, phone, email, vk, telegram, map_embed)
VALUES (
  1,
  'Таганрог, ул. Энгельса, 1, ИТА ЮФУ, корпус «Г»',
  '+7 (964) 908-77-60',
  'azykova@sfedu.ru',
  'https://vk.com/proittaganrog',
  'https://t.me/school_pro_it',
  'https://www.google.com/maps?q=%D0%A2%D0%B0%D0%B3%D0%B0%D0%BD%D1%80%D0%BE%D0%B3%2C%20%D1%83%D0%BB%D0%B8%D1%86%D0%B0%20%D0%AD%D0%BD%D0%B3%D0%B5%D0%BB%D1%8C%D1%81%D0%B0%2C%201&output=embed'
);

COMMIT;
