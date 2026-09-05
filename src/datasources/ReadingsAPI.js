import { RESTDataSource } from '@apollo/datasource-rest';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { getKeycloakToken } from '../utils/auth.js';

const tracer = trace.getTracer('readings-api');

export class ReadingsAPI extends RESTDataSource {
  baseURL = process.env.READINGS_API_URL || 'http://localhost:8089/api/v1';

  async willSendRequest(path, request) {
    try {
      const token = await getKeycloakToken();
      request.headers['Authorization'] = `Bearer ${token}`;
    } catch (error) {
      console.error('[ReadingsAPI] Failed to get Keycloak token:', error);
      throw new Error('Authentication failed');
    }
  }

  async getRecentBloodPressureReadings(userId, limit = 10) {
    return tracer.startActiveSpan('ReadingsAPI.getRecentBloodPressureReadings', async (span) => {
      try {
        span.setAttribute('user.id', userId);
        span.setAttribute('limit', limit);
        
        const response = await this.get(this.baseURL + `/metrics/bloodpressure/readings`, {
          params: { 
            userId,
            page: 0,
            size: limit
          }
        });
        
        const readings = response.data?.map(reading => ({
          date: reading.timestamp,
          systolic: reading.values.health_bloodpressure_systolic,
          diastolic: reading.values.health_bloodpressure_diastolic,
          status: reading.status
        })) || [];
        
        span.setAttribute('readings.count', readings.length);
        span.setStatus({ code: SpanStatusCode.OK });
        return readings;
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
