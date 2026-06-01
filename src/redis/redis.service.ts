import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

type MemoryValue = { value: string; expiresAt?: number };

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client?: Redis;
  private readonly memory = new Map<string, MemoryValue>();
  private readonly useMemory: boolean;

  constructor(private readonly config: ConfigService) {
    this.useMemory = this.config.get<string>("NODE_ENV") === "test";
    if (!this.useMemory) {
      this.client = new Redis(this.config.get<string>("REDIS_URL", "redis://localhost:6379"), {
        maxRetriesPerRequest: 2,
        lazyConnect: true
      });
      this.client.on("error", (error) => {
        console.error(JSON.stringify({ message: "Redis error", error: error.message }));
      });
    }
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  async setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (this.useMemory) {
      this.memory.set(key, { value: serialized, expiresAt: Date.now() + ttlSeconds * 1000 });
      return;
    }
    await this.client!.set(key, serialized, "EX", ttlSeconds);
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (this.useMemory) {
      const entry = this.memory.get(key);
      if (!entry) return null;
      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        this.memory.delete(key);
        return null;
      }
      return JSON.parse(entry.value) as T;
    }
    const value = await this.client!.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async del(key: string): Promise<void> {
    if (this.useMemory) {
      this.memory.delete(key);
      return;
    }
    await this.client!.del(key);
  }

  async incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
    if (this.useMemory) {
      const current = Number((await this.getJson<number>(key)) ?? 0) + 1;
      await this.setJson(key, current, ttlSeconds);
      return current;
    }
    const value = await this.client!.incr(key);
    if (value === 1) await this.client!.expire(key, ttlSeconds);
    return value;
  }
}
