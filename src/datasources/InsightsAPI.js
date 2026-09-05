import { RESTDataSource } from '@apollo/datasource-rest';
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('insights-api');

export class InsightsAPI extends RESTDataSource {
  baseURL = process.env.INSIGHTS_API_URL || 'http://localhost:3005/api';

  async getHealthInsights(userId) {
    return tracer.startActiveSpan('InsightsAPI.getHealthInsights', async (span) => {
      try {
        span.setAttribute('user.id', userId);
        
        const result = await this.get(`/insights/${userId}`);
        
        span.setAttribute('insights.count', result?.length || 0);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }
}

// Made with Bob
