import {
  Inject,
  Injectable,
  Global,
  Module,
  type DynamicModule,
} from "@nestjs/common";
import {
  captureOutboxLineage,
  type NodeObservabilityServices,
} from "@unimate/observability/node";
import type {
  ErrorReporter,
  ExecutionContextProvider,
  OutboxLineage,
  StructuredLogger,
  TelemetryProvider,
} from "@unimate/observability";

export const API_STRUCTURED_LOGGER = Symbol("API_STRUCTURED_LOGGER");
export const API_ERROR_REPORTER = Symbol("API_ERROR_REPORTER");
export const API_EXECUTION_CONTEXT = Symbol("API_EXECUTION_CONTEXT");
export const API_TELEMETRY_PROVIDER = Symbol("API_TELEMETRY_PROVIDER");

@Injectable()
export class OutboxLineageService {
  constructor(
    @Inject(API_EXECUTION_CONTEXT)
    private readonly executionContext: ExecutionContextProvider,
    @Inject(API_TELEMETRY_PROVIDER)
    private readonly telemetry: TelemetryProvider,
  ) {}

  capture(): OutboxLineage {
    return captureOutboxLineage({
      executionContext: this.executionContext,
      telemetry: this.telemetry,
    });
  }
}

@Global()
@Module({})
export class ObservabilityModule {
  static register(services: NodeObservabilityServices): DynamicModule {
    return {
      module: ObservabilityModule,
      providers: [
        { provide: API_STRUCTURED_LOGGER, useValue: services.logger },
        { provide: API_ERROR_REPORTER, useValue: services.errorReporter },
        {
          provide: API_EXECUTION_CONTEXT,
          useValue: services.executionContext,
        },
        {
          provide: API_TELEMETRY_PROVIDER,
          useValue: services.telemetry,
        },
        OutboxLineageService,
      ],
      exports: [
        API_STRUCTURED_LOGGER,
        API_ERROR_REPORTER,
        API_EXECUTION_CONTEXT,
        API_TELEMETRY_PROVIDER,
        OutboxLineageService,
      ],
    };
  }
}

export type ApiLogger = StructuredLogger;
export type ApiErrorReporter = ErrorReporter;
