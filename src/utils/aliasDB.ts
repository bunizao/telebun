import Database from "better-sqlite3";
import { createDirectoryInAssets } from "./pathHelpers";
import path from "path";
import fs from "fs";

interface AliasRecord {
  original: string;
  final: string;
}

class AliasDB {
  private db: Database.Database | null = null;
  private readonly fallbackPath: string;
  private fallbackData: AliasRecord[] = [];
  private static fallbackWarned = false;

  constructor(
    dbPath: string = path.join(createDirectoryInAssets("alias"), "alias.db")
  ) {
    this.fallbackPath = path.join(createDirectoryInAssets("alias"), "alias.json");
    try {
      this.db = new Database(dbPath);
      this.init();
    } catch (error) {
      this.db = null;
      this.loadFallback();
      if (!AliasDB.fallbackWarned) {
        AliasDB.fallbackWarned = true;
        console.warn(
          `[AliasDB] better-sqlite3 unavailable, using JSON fallback: ${String(
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
      CREATE TABLE IF NOT EXISTS aliases (
        original TEXT PRIMARY KEY,
        final TEXT NOT NULL
      )
    `
      )
      .run();
  }

  private loadFallback(): void {
    try {
      if (!fs.existsSync(this.fallbackPath)) {
        this.fallbackData = [];
        this.flushFallback();
        return;
      }
      const raw = fs.readFileSync(this.fallbackPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.fallbackData = parsed.filter(
          (x) =>
            x &&
            typeof x === "object" &&
            typeof x.original === "string" &&
            typeof x.final === "string"
        );
        return;
      }
      this.fallbackData = [];
      this.flushFallback();
    } catch {
      this.fallbackData = [];
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
   * 设置别名（如果已存在则更新）
   */
  public set(original: string, final: string): void {
    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO aliases (original, final)
        VALUES (?, ?)
        ON CONFLICT(original) DO UPDATE SET final = excluded.final
      `);
      stmt.run(original, final);
      return;
    }

    const idx = this.fallbackData.findIndex((x) => x.original === original);
    if (idx >= 0) {
      this.fallbackData[idx].final = final;
    } else {
      this.fallbackData.push({ original, final });
    }
    this.flushFallback();
  }

  /**
   * 列出所有别名
   */
  public list(): AliasRecord[] {
    if (this.db) {
      return this.db
        .prepare<[], AliasRecord>(
          `
        SELECT original, final FROM aliases
      `
        )
        .all();
    }
    return [...this.fallbackData].sort((a, b) =>
      a.original.localeCompare(b.original)
    );
  }

  /**
   * 删除别名
   */
  public del(original: string): boolean {
    if (this.db) {
      const info = this.db
        .prepare(`DELETE FROM aliases WHERE original = ?`)
        .run(original);
      return info.changes > 0;
    }

    const before = this.fallbackData.length;
    this.fallbackData = this.fallbackData.filter((x) => x.original !== original);
    const changed = this.fallbackData.length !== before;
    if (changed) this.flushFallback();
    return changed;
  }

  /**
   * 根据 original 获取 final
   * @param original 原始值
   * @returns final 字符串，找不到则返回 null
   */
  public get(original: string): string | null {
    if (this.db) {
      const row = this.db
        .prepare<[string], { final: string }>(
          "SELECT final FROM aliases WHERE original = ?"
        )
        .get(original);
      return row ? row.final : null;
    }
    const row = this.fallbackData.find((x) => x.original === original);
    return row ? row.final : null;
  }
  /**
   * 根据 final 获取所有 original
   * @param final
   * @returns original 字符串数组，找不到则返回空数组
   */
  public getOriginal(final: string): string[] {
    if (this.db) {
      const rows = this.db
        .prepare<[string], { original: string }>(
          `
        SELECT original FROM aliases WHERE final = ?
      `
        )
        .all(final);
      return rows.map((row) => row.original);
    }
    return this.fallbackData
      .filter((x) => x.final === final)
      .map((x) => x.original);
  }

  /**
   * 关闭数据库
   */
  public close(): void {
    this.db?.close();
  }
}

export { AliasDB };
