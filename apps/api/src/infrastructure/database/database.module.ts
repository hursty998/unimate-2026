import {
  Inject,
  Injectable,
  Global,
  Module,
  type DynamicModule,
  type OnModuleDestroy,
} from "@nestjs/common";
import {
  createDatabaseClient,
  type DatabaseClientOptions,
} from "@unimate/database";

const DATABASE_CLIENT_OPTIONS = Symbol("DATABASE_CLIENT_OPTIONS");

@Injectable()
export class DatabaseClientService implements OnModuleDestroy {
  readonly client: ReturnType<typeof createDatabaseClient>;

  constructor(@Inject(DATABASE_CLIENT_OPTIONS) options: DatabaseClientOptions) {
    this.client = createDatabaseClient(options);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseClientOptions): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: DATABASE_CLIENT_OPTIONS,
          useValue: options,
        },
        DatabaseClientService,
      ],
      exports: [DatabaseClientService],
    };
  }
}
