import Database from "better-sqlite3";
import path from "path";
import { createDirectoryInAssets } from "./pathHelpers";
import fs from "fs";

class SendLogDB {
  private db: Database.Database | null = null;
  private readonly fallbackPath: string;
  private fallbackData: { target: string } = { target: "me" };
  private static fallbackWarned = false;

  constructor(
    dbPath: string = path.join(createDirectoryInAssets("sendlog"), "sendlog.db")
  ) {
    this.fallbackPath = path.join(
      createDirectoryInAssets("sendlog"),
      "sendlog.json"
    );
    try {
      this.db = new Database(dbPath);
      this.init();
    } catch (error) {
      this.db = null;
      this.loadFallback();
      if (!SendLogDB.fallbackWarned) {
        SendLogDB.fallbackWarned = true;
        console.warn(
          `[SendLogDB] better-sqlite3 unavailable, using JSON fallback: ${String(
            error
          )}`
        );
      }
    }
  }

  private init(): void {
    if (!this.db) return;
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )`
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
      if (parsed && typeof parsed.target === "string" && parsed.target.length > 0) {
        this.fallbackData.target = parsed.target;
      }
    } catch {
      this.fallbackData.target = "me";
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

  public setTarget(target: string): void {
    if (this.db) {
      this.db
        .prepare(
          `INSERT INTO config (key, value) VALUES ('target', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        )
        .run(target);
      return;
    }
    this.fallbackData.target = target;
    this.flushFallback();
  }

  public getTarget(): string {
    if (this.db) {
      const row = this.db
        .prepare(`SELECT value FROM config WHERE key = 'target'`)
        .get() as { value: string } | undefined;
      return row ? row.value : "me";
    }
    return this.fallbackData.target || "me";
  }

  public close(): void {
    this.db?.close();
  }
}

export { SendLogDB };
