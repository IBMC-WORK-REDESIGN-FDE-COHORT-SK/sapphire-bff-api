import { logs } from '@opentelemetry/api-logs';
import { trace } from '@opentelemetry/api';

// Get the logger provider
const loggerProvider = logs.getLoggerProvider();
const logger = loggerProvider.getLogger('sapphire-bff-api', '1.0.0');

/**
 * Log levels
 */
export const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
};

/**
 * Create a structured log entry
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} attributes - Additional attributes
 */
function emitLog(level, message, attributes = {}) {
  // Get current span context for correlation
  const span = trace.getActiveSpan();
  const spanContext = span?.spanContext();

  // Emit log record
  logger.emit({
    severityText: level,
    body: message,
    attributes: {
      ...attributes,
      'service.name': 'sapphire-bff-api',
      ...(spanContext && {
        'trace_id': spanContext.traceId,
        'span_id': spanContext.spanId,
      }),
    },
    timestamp: Date.now(),
  });

  // Also log to console for local development
  const consoleMethod = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'info';
  console[consoleMethod](`[${level}] ${message}`, attributes);
}

/**
 * Logger utility with OpenTelemetry integration
 */
export const otelLogger = {
  debug: (message, attributes) => emitLog(LogLevel.DEBUG, message, attributes),
  info: (message, attributes) => emitLog(LogLevel.INFO, message, attributes),
  warn: (message, attributes) => emitLog(LogLevel.WARN, message, attributes),
  error: (message, attributes) => emitLog(LogLevel.ERROR, message, attributes),
};

// Made with Bob