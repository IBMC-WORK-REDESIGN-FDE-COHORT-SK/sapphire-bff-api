import { RESTDataSource } from '@apollo/datasource-rest';
import { getKeycloakToken } from '../utils/auth.js';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('health-metrics-api');

export class HealthMetricsAPI extends RESTDataSource {
  baseURL = process.env.HEALTH_METRICS_API_URL || 'http://localhost:8089/api/v1';

  /**
   * Override willSendRequest to add Keycloak token to all requests
   */
  async willSendRequest(path, request) {
    try {
      console.info(`[HealthMetricsAPI] Preparing request to: ${this.baseURL}${path}`);
      const token = await getKeycloakToken();
      request.headers['Authorization'] = `Bearer ${token}`;
      console.info(`[HealthMetricsAPI] Authorization token added to request`);
    } catch (error) {
      console.error('[HealthMetricsAPI] Failed to get Keycloak token:', error);
      throw new Error('Authentication failed');
    }
  }

  /**
   * Override didReceiveResponse to log responses
   */
  async didReceiveResponse(response, _request) {
    console.info(`[HealthMetricsAPI] Response received - Status: ${response.status}`);
    return response;
  }

  async getHeartRate(userId) {
    return tracer.startActiveSpan('HealthMetricsAPI.getHeartRate', async (span) => {
      try {
        span.setAttribute('user.id', userId);
        const result = await this.get(`/health-metrics/${userId}/heart-rate`);
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

  async getSteps(userId) {
    return tracer.startActiveSpan('HealthMetricsAPI.getSteps', async (span) => {
      try {
        span.setAttribute('user.id', userId);
        const result = await this.get(`/health-metrics/${userId}/steps`);
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

  async getBloodPressure(userId) {
    return tracer.startActiveSpan('HealthMetricsAPI.getBloodPressure', async (span) => {
      try {
        span.setAttribute('user.id', userId);
        const result = await this.get(`/health-metrics/${userId}/blood-pressure`);
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

  async getTemperature(userId) {
    return tracer.startActiveSpan('HealthMetricsAPI.getTemperature', async (span) => {
      try {
        span.setAttribute('user.id', userId);
        const result = await this.get(`/health-metrics/${userId}/temperature`);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        // T013: removed hardcoded fallback — surface the error so callers can handle it
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get paginated temperature readings for a user (T011).
   * Calls GET /metrics/temperature/readings on charting-api via HEALTH_METRICS_API_URL.
   * @param {string} userId - User ID
   * @param {number|null} from - Start epoch ms (optional)
   * @param {number|null} to - End epoch ms (optional)
   * @returns {Promise<Array>} Array of TemperatureReading objects
   */
  async getTemperatureHistory(userId, from, to) {
    return tracer.startActiveSpan('HealthMetricsAPI.getTemperatureHistory', async (span) => {
      try {
        span.setAttribute('user.id', userId);

        const params = new URLSearchParams({ userId, size: '50' });
        if (from != null) params.set('from', String(from));
        if (to != null) params.set('to', String(to));

        const response = await this.get(`/metrics/temperature/readings?${params.toString()}`);

        console.info(JSON.stringify({
          audit_event: 'temperature.history.read',
          accessor_id: userId,
          affected_user_id: userId,
          record_count: response?.data?.length ?? 0,
          timestamp: new Date().toISOString()
        }));

        // Map charting-api snake_case to TemperatureReading GraphQL camelCase shape
        const readings = (response?.data || []).map(r => ({
          id: r.request_id || null,
          userId: r.user_id,
          timestamp: r.time,
          value: r.metric_value,
          unit: r.unit,
          normalizedValueCelsius: r.normalized_value_celsius,
          status: r.status || null,
          sourceDeviceId: r.device_id || null,
          measurementMethod: r.measurement_method || null
        }));

        span.setAttribute('temperature.history.count', readings.length);
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

  /**
   * Get sleep data for a user from the last 24 hours
   * @param {string} userId - User email/ID
   * @returns {Promise<Object>} Sleep metric data
   */
  async getSleep(userId) {
    return tracer.startActiveSpan('HealthMetricsAPI.getSleep', async (span) => {
      try {
        span.setAttribute('user.id', userId);
        console.info(`[HealthMetricsAPI] getSleep called for user: ${userId}`);

        // Calculate time range for last 24 hours in nanoseconds
        const now = Date.now();
        const last24Hours = now - (24 * 60 * 60 * 1000);
        const timeRange = {
          from: last24Hours * 1000000, // Convert to nanoseconds
          to: now * 1000000
        };

        const requestBody = {
          userId,
          metricType: 'SLEEP',
          timeRange,
          resolution: 'DAY',
          aggregation: 'SUM',
          chartType: 'BAR',
          series: [
            {
              name: 'Sleep',
              metricName: 'health_sleep_duration',
              aggregation: 'AVG'
            }
          ]
        };

        console.info('[HealthMetricsAPI] getSleep - Request:', requestBody);
        span.addEvent('Sending sleep query request');

        const response = await this.post(this.baseURL + '/charts/query', {
          body: requestBody
        });

        console.info('[HealthMetricsAPI] getSleep - Response:', JSON.stringify({
          chartType: response.chartType,
          seriesCount: response.seriesCount,
          totalDataPoints: response.totalDataPoints,
          pointCount: response.series?.[0]?.pointCount
        }, null, 2));

        // Extract the last value from the points array
        if (response.series && response.series.length > 0 && response.series[0].points.length > 0) {
          const points = response.series[0].points;
          const lastPoint = points[points.length - 1];
          
          // Convert seconds to hours and format the response
          const sleepHours = lastPoint.value / 3600; // Convert seconds to hours
          
          const sleepMetric = {
            hours: parseFloat(sleepHours.toFixed(1)),
            goal: 8.0,
            status: sleepHours >= 7 ? 'good' : 'low',
            statusMessage: sleepHours >= 7
              ? `Great! You got ${sleepHours.toFixed(1)} hours of sleep.`
              : `You only got ${sleepHours.toFixed(1)} hours. Try to get more rest.`
          };

          span.setAttribute('sleep.hours', sleepMetric.hours);
          span.setAttribute('sleep.status', sleepMetric.status);
          console.info(`[HealthMetricsAPI] getSleep - Transformed sleep data: ${sleepHours.toFixed(1)} hours`);
          span.setStatus({ code: SpanStatusCode.OK });
          return sleepMetric;
        }

        // Return default values if no data
        console.warn('[HealthMetricsAPI] getSleep - No data points found, returning default');
        span.addEvent('No sleep data found');
        span.setStatus({ code: SpanStatusCode.OK });
        return {
          hours: 0,
          goal: 8.0,
          status: 'no-data',
          statusMessage: 'No sleep data available'
        };
      } catch (error) {
        console.error('[HealthMetricsAPI] getSleep - Error:', error.message);
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
