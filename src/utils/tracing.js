import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

// Enable diagnostic logging for debugging (optional)
if (process.env.OTEL_LOG_LEVEL === 'debug') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

const OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces';
const OTEL_EXPORTER_OTLP_LOGS_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT || 'http://localhost:4318/v1/logs';
const OTEL_EXPORTER_OTLP_METRICS_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || 'http://localhost:4318/v1/metrics';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'sapphire-bff-api';
const SERVICE_VERSION = process.env.OTEL_SERVICE_VERSION || '1.0.0';

// Configure the OTLP trace exporter
const traceExporter = new OTLPTraceExporter({
  url: OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  headers: {},
});

// Configure the OTLP log exporter
const logExporter = new OTLPLogExporter({
  url: OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
  headers: {},
});

// Configure the OTLP metric exporter
const metricExporter = new OTLPMetricExporter({
  url: OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
  headers: {},
});

// Configure metric reader with periodic export (every 60 seconds)
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 60000, // Export every 60 seconds
});

// Configure the SDK
const sdk = new NodeSDK({
  traceExporter,
  logRecordProcessor: new BatchLogRecordProcessor(logExporter),
  metricReader,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Customize auto-instrumentation
      '@opentelemetry/instrumentation-fs': {
        enabled: false, // Disable file system instrumentation to reduce noise
      },
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        ignoreIncomingRequestHook: (request) => {
          // Ignore health check endpoints
          return request.url?.includes('/health') || request.url?.includes('/metrics');
        },
      },
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-graphql': {
        enabled: true,
        mergeItems: true,
        allowValues: true,
      },
      '@opentelemetry/instrumentation-redis-4': {
        enabled: true,
      },
    }),
  ],
});

// Initialize the SDK
export function initializeTracing() {
  try {
    sdk.start();
    console.log('✅ OpenTelemetry initialized');
    console.log(`📊 Exporting traces to: ${OTEL_EXPORTER_OTLP_TRACES_ENDPOINT}`);
    console.log(`📝 Exporting logs to: ${OTEL_EXPORTER_OTLP_LOGS_ENDPOINT}`);
    console.log(`📈 Exporting metrics to: ${OTEL_EXPORTER_OTLP_METRICS_ENDPOINT}`);
    console.log(`🏷️  Service: ${SERVICE_NAME} v${SERVICE_VERSION}`);
  } catch (error) {
    console.error('❌ Error initializing OpenTelemetry:', error);
  }
}

// Graceful shutdown
export async function shutdownTracing() {
  try {
    await sdk.shutdown();
    console.log('✅ OpenTelemetry tracing shut down successfully');
  } catch (error) {
    console.error('❌ Error shutting down OpenTelemetry:', error);
  }
}

// Handle process termination
process.on('SIGTERM', async () => {
  await shutdownTracing();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await shutdownTracing();
  process.exit(0);
});

// Made with Bob