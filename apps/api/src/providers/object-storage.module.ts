import { Global, Module, type DynamicModule } from "@nestjs/common";
import { SupabaseObjectStorage } from "@unimate/storage/supabase";
import type { ApiConfig } from "../config/environment.js";
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from "../infrastructure/object-storage.js";

@Global()
@Module({})
export class ObjectStorageModule {
  static register(config: ApiConfig): DynamicModule {
    const secretKey = config.supabaseSecretKey;
    const bucketName = config.supabaseStorageBucket;

    if (!secretKey || !bucketName) {
      throw new Error(
        "Storage-proof configuration is required outside production.",
      );
    }

    return {
      module: ObjectStorageModule,
      providers: [
        {
          provide: OBJECT_STORAGE,
          useFactory: (): ObjectStorage =>
            new SupabaseObjectStorage({
              supabaseUrl: config.supabaseUrl,
              secretKey,
              bucketName,
            }),
        },
      ],
      exports: [OBJECT_STORAGE],
    };
  }
}
