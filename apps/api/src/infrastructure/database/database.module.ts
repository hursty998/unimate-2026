import {
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type OnModuleDestroy,
} from "@nestjs/common";
import { createDatabaseClient } from "@unimate/database";

const DATABASE_CONNECTION_STRING = Symbol("DATABASE_CONNECTION_STRING");

@Injectable()
export class DatabaseClientService implements OnModuleDestroy {
  readonly client: ReturnType<typeof createDatabaseClient>;

  constructor(@Inject(DATABASE_CONNECTION_STRING) connectionString: string) {
    this.client = createDatabaseClient({ connectionString });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}

@Module({})
export class DatabaseModule {
  static forRoot(connectionString: string): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: DATABASE_CONNECTION_STRING,
          useValue: connectionString,
        },
        DatabaseClientService,
      ],
      exports: [DatabaseClientService],
    };
  }
}
