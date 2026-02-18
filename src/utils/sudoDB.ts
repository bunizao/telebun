import Database from "better-sqlite3";
import { createDirectoryInAssets } from "./pathHelpers";
import path from "path";
import fs from "fs";

interface UserRecord {
  uid: number;
  username: string;
}

interface ChatRecord {
  id: number;
  name: string;
}

class SudoDB {
  private db: Database.Database | null = null;
  private readonly fallbackPath: string;
  private fallbackData: { users: UserRecord[]; chats: ChatRecord[] } = {
    users: [],
    chats: [],
  };
  private static fallbackWarned = false;

  constructor(
    dbPath: string = path.join(createDirectoryInAssets("sudo"), "sudo.db")
  ) {
    this.fallbackPath = path.join(createDirectoryInAssets("sudo"), "sudo.json");
    try {
      this.db = new Database(dbPath);
      this.init();
    } catch (error) {
      this.db = null;
      this.loadFallback();
      if (!SudoDB.fallbackWarned) {
        SudoDB.fallbackWarned = true;
        console.warn(
          `[SudoDB] better-sqlite3 unavailable, using JSON fallback: ${String(
            error
          )}`
        );
      }
    }
  }

  // 初始化表结构
  private init(): void {
    if (!this.db) return;
    this.db
      .prepare(
        `
      CREATE TABLE IF NOT EXISTS users (
        uid INTEGER PRIMARY KEY,
        username TEXT NOT NULL
      )
    `
      )
      .run();

    // 新增 chats 表
    this.db
      .prepare(
        `
      CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      )
    `
      )
      .run();
  }

  private loadFallback(): void {
    try {
      if (!fs.existsSync(this.fallbackPath)) {
        this.flushFallback();
        return;
      }
      const raw = fs.readFileSync(this.fallbackPath, "utf-8");
      const parsed = JSON.parse(raw);
      const users = Array.isArray(parsed?.users)
        ? parsed.users.filter(
            (x: any) =>
              x &&
              typeof x === "object" &&
              Number.isFinite(Number(x.uid)) &&
              typeof x.username === "string"
          )
        : [];
      const chats = Array.isArray(parsed?.chats)
        ? parsed.chats.filter(
            (x: any) =>
              x &&
              typeof x === "object" &&
              Number.isFinite(Number(x.id)) &&
              typeof x.name === "string"
          )
        : [];
      this.fallbackData = {
        users: users.map((x: any) => ({ uid: Number(x.uid), username: x.username })),
        chats: chats.map((x: any) => ({ id: Number(x.id), name: x.name })),
      };
    } catch {
      this.fallbackData = { users: [], chats: [] };
      this.flushFallback();
    }
  }

  private flushFallback(): void {
    fs.writeFileSync(
      this.fallbackPath,
      JSON.stringify(this.fallbackData, null, 2),
      "utf-8"
    );
  }

  /**
   * 添加或更新用户
   */
  public add(uid: number, username: string): void {
    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO users (uid, username)
        VALUES (?, ?)
        ON CONFLICT(uid) DO UPDATE SET username = excluded.username
      `);
      stmt.run(uid, username);
      return;
    }

    const idx = this.fallbackData.users.findIndex((x) => x.uid === uid);
    if (idx >= 0) {
      this.fallbackData.users[idx].username = username;
    } else {
      this.fallbackData.users.push({ uid, username });
    }
    this.flushFallback();
  }

  /**
   * 删除用户
   */
  public del(uid: number): boolean {
    if (this.db) {
      const info = this.db
        .prepare(
          `
        DELETE FROM users WHERE uid = ?
      `
        )
        .run(uid);
      return info.changes > 0;
    }
    const before = this.fallbackData.users.length;
    this.fallbackData.users = this.fallbackData.users.filter((x) => x.uid !== uid);
    const changed = this.fallbackData.users.length !== before;
    if (changed) this.flushFallback();
    return changed;
  }

  /**
   * 列出所有用户
   */
  public ls(): UserRecord[] {
    if (this.db) {
      return this.db
        .prepare<[], UserRecord>(
          `
          SELECT uid, username FROM users
          ORDER BY uid ASC
        `
        )
        .all();
    }
    return [...this.fallbackData.users].sort((a, b) => a.uid - b.uid);
  }

  // 添加或更新聊天
  public addChat(id: number, name: string): void {
    if (this.db) {
      this.db
        .prepare(
          `
          INSERT INTO chats (id, name)
          VALUES (?, ?)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name
        `
        )
        .run(id, name);
      return;
    }

    const idx = this.fallbackData.chats.findIndex((x) => x.id === id);
    if (idx >= 0) {
      this.fallbackData.chats[idx].name = name;
    } else {
      this.fallbackData.chats.push({ id, name });
    }
    this.flushFallback();
  }

  // 删除聊天
  public delChat(id: number): boolean {
    if (this.db) {
      const info = this.db
        .prepare(
          `
          DELETE FROM chats WHERE id = ?
        `
        )
        .run(id);
      return info.changes > 0;
    }
    const before = this.fallbackData.chats.length;
    this.fallbackData.chats = this.fallbackData.chats.filter((x) => x.id !== id);
    const changed = this.fallbackData.chats.length !== before;
    if (changed) this.flushFallback();
    return changed;
  }

  // 列出所有聊天
  public lsChats(): ChatRecord[] {
    if (this.db) {
      return this.db
        .prepare<[], ChatRecord>(
          `
            SELECT id, name FROM chats
            ORDER BY id ASC
          `
        )
        .all();
    }
    return [...this.fallbackData.chats].sort((a, b) => a.id - b.id);
  }

  /**
   * 关闭数据库
   */
  public close(): void {
    this.db?.close();
  }
}

export { SudoDB, UserRecord, ChatRecord };
