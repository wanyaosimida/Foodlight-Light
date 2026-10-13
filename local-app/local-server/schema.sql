PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  salt TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL, session_id TEXT,
  token_kind TEXT NOT NULL DEFAULT 'access'
);
CREATE TABLE IF NOT EXISTS storage_objects (
  path TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT, phone TEXT, role TEXT NOT NULL DEFAULT 'user', nickname TEXT,
  avatar_url TEXT, gender TEXT, age INTEGER, height_cm REAL, weight_kg REAL,
  activity_level TEXT, goal TEXT, allergies TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT, cover_url TEXT, meal_type TEXT,
  ingredients TEXT NOT NULL DEFAULT '[]', steps TEXT NOT NULL DEFAULT '[]',
  nutrition TEXT NOT NULL DEFAULT '{}', nutritionist_comment TEXT,
  is_ai_generated INTEGER NOT NULL DEFAULT 0, source TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meal_logs (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date TEXT NOT NULL, meal_type TEXT, food_name TEXT NOT NULL, portion TEXT,
  calories REAL NOT NULL DEFAULT 0, protein REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0, fat REAL NOT NULL DEFAULT 0,
  image_url TEXT, recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL, gl_value REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS weight_logs (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date TEXT NOT NULL, weight_kg REAL NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'talk', content TEXT NOT NULL DEFAULT '',
  images TEXT NOT NULL DEFAULT '[]', data TEXT NOT NULL DEFAULT '{}',
  tags TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'approved',
  reject_reason TEXT, author_name TEXT NOT NULL DEFAULT '', author_avatar TEXT,
  like_count INTEGER NOT NULL DEFAULT 0, comment_count INTEGER NOT NULL DEFAULT 0,
  favorite_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS community_comments (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL, author_name TEXT NOT NULL DEFAULT '', author_avatar TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS community_likes (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, UNIQUE(post_id, owner_id)
);
CREATE TABLE IF NOT EXISTS community_favorites (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, UNIQUE(post_id, owner_id)
);
CREATE TABLE IF NOT EXISTS community_follows (
  id TEXT PRIMARY KEY, follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, UNIQUE(follower_id, followee_id)
);
CREATE TABLE IF NOT EXISTS food_library (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, brand TEXT, net_content TEXT,
  nutrition TEXT NOT NULL DEFAULT '{}', ingredients TEXT, advice TEXT,
  level TEXT, category TEXT NOT NULL DEFAULT '其他', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS meal_logs_owner_date ON meal_logs(owner_id, log_date);
CREATE INDEX IF NOT EXISTS posts_created ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS comments_post ON community_comments(post_id, created_at);

CREATE TRIGGER IF NOT EXISTS likes_insert AFTER INSERT ON community_likes BEGIN
  UPDATE community_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
END;
CREATE TRIGGER IF NOT EXISTS likes_delete AFTER DELETE ON community_likes BEGIN
  UPDATE community_posts SET like_count = max(0, like_count - 1) WHERE id = OLD.post_id;
END;
CREATE TRIGGER IF NOT EXISTS comments_insert AFTER INSERT ON community_comments BEGIN
  UPDATE community_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
END;
CREATE TRIGGER IF NOT EXISTS comments_delete AFTER DELETE ON community_comments BEGIN
  UPDATE community_posts SET comment_count = max(0, comment_count - 1) WHERE id = OLD.post_id;
END;
CREATE TRIGGER IF NOT EXISTS favorites_insert AFTER INSERT ON community_favorites BEGIN
  UPDATE community_posts SET favorite_count = favorite_count + 1 WHERE id = NEW.post_id;
END;
CREATE TRIGGER IF NOT EXISTS favorites_delete AFTER DELETE ON community_favorites BEGIN
  UPDATE community_posts SET favorite_count = max(0, favorite_count - 1) WHERE id = OLD.post_id;
END;
