import { Injectable } from '@nestjs/common';
import { env } from 'node:process';

const defaults: Record<string, string> = {
  MONGO_URI: 'mongodb://root:root@localhost:27017',
  MONGO_DB: 'local',
};

@Injectable()
export class ConfigService {
  get(key: string, defaultValue?: string): string | undefined {
    return env[key] ?? defaultValue ?? defaults[key];
  }

  set(key: string, value: string): void {
    env[key] = value;
  }
}
