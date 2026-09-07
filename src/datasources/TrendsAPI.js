import { RESTDataSource } from '@apollo/datasource-rest';
import { getKeycloakToken } from '../utils/auth.js';
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('trends-api');

export class TrendsAPI extends RESTDataSource {
  baseURL = process.env.TRENDS_API_URL || 'http://localhost:8089/api/v1';

  /**
   * Override willSendRequest to add Keycloak token to all requests
   */
  async willSendRequest(path, request) {
    try {
      console.info(`[TrendsAPI] Preparing request to: ${this.baseURL}${path}`);
      const token = await getKeycloakToken();
      request.headers['Authorization'] = `Bearer ${token}`;
      console.info(`[TrendsAPI] token: ${token}`)
      console.info(`[TrendsAPI] Authorization token added to request`);
    } catch (error) {
      console.error('[TrendsAPI] Failed to get Keycloak token:', error);
      throw new Error('Authentication failed');
    }
  }

  /**
   * Override didReceiveResponse to log responses
   */
  async didReceiveResponse(response, _request) {
    console.info(`[TrendsAPI] Response received - Status: ${response.status}`);
    return response;
  }

  /**
   * Query chart data with flexible parameters
   * @param {Object} params - Chart query parameters
   * @param {string} params.userId - User email/ID
   * @param {string} params.metricType - Metric type (e.g., 'ACTIVITY', 'HEART_RATE')
   * @param {Object} params.timeRange - Time range with from/to timestamps in nanoseconds
   * @param {string} params.resolution - Time resolution (e.g., 'FIVE_MIN', 'HOUR', 'DAY')
   * @param {string} params.aggregation - Aggregation method (e.g., 'SUM', 'AVG', 'MAX', 'MIN')
   * @param {string} params.chartType - Chart type (e.g., 'BAR', 'LINE', 'AREA')
   * @param {Array} params.series - Array of series configurations
   * @returns {Promise<Object>} Chart data response
   */
  async queryChart(params) {
    return tracer.startActiveSpan('TrendsAPI.queryChart', async (span) => {
      try {
        const {
          userId,
          metricType,
          timeRange,
          resolution,
          aggregation,
          chartType,
          series
        } = params;

        span.setAttribute('user.id', userId);
        span.setAttribute('metric.type', metricType);
        span.setAttribute('chart.type', chartType);
        span.setAttribute('resolution', resolution);

        const requestBody = {
          userId,
          metricType,
          timeRange,
          resolution,
          aggregation,
          chartType,
          series
        };

        console.info('[TrendsAPI] queryChart - Request:', JSON.stringify(requestBody));
        span.addEvent('Sending chart query request');

        const response = await this.post(this.baseURL + '/charts/query', {
          body: requestBody
        });

        console.info('[TrendsAPI] queryChart - Response:', JSON.stringify({
          chartType: response.chartType,
          seriesCount: response.seriesCount,
          totalDataPoints: response.totalDataPoints,
          xaxis: response.xaxis,
          seriesDetails: response.series?.map(s => ({
            name: s.name,
            pointCount: s.pointCount
          }))
        }, null, 2));

        span.setAttribute('response.series_count', response.seriesCount);
        span.setAttribute('response.total_data_points', response.totalDataPoints);
        span.setStatus({ code: SpanStatusCode.OK });
        return response;
      } catch (error) {
        console.error('[TrendsAPI] queryChart - Error:', error.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get heart rate trends for a user
   * @param {string} userId - User email/ID
   * @param {Object} timeRange - Time range with from/to timestamps in nanoseconds
   * @param {string} resolution - Time resolution (default: 'FIVE_MIN')
   * @returns {Promise<Object>} Heart rate trend data
   */
  async getHeartRateTrends(userId, timeRange, resolution = 'FIVE_MIN') {
    return tracer.startActiveSpan('TrendsAPI.getHeartRateTrends', async (span) => {
      try {
        span.setAttribute('user.id', userId);
        span.setAttribute('resolution', resolution);
        console.info(`[TrendsAPI] getHeartRateTrends called for user: ${userId}`);
        
        const result = await this.queryChart({
          userId,
          metricType: 'HEARTRATE',
          timeRange,
          resolution,
          aggregation: 'AVG',
          chartType: 'LINE',
          series: [
            {
              name: 'Heart Rate',
              metricName: 'health_heartrate_bpm',
              aggregation: 'AVG'
            }
          ]
        });
        
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

  /**
   * Get activity summary for a user
   * @param {string} userId - User email/ID
   * @param {Object} timeRange - Time range with from/to timestamps in nanoseconds
   * @param {string} resolution - Time resolution (default: 'FIVE_MIN')
   * @returns {Promise<Object>} Activity summary data
   */
  async getActivitySummary(userId, timeRange, resolution = 'DAY') {
    return tracer.startActiveSpan('TrendsAPI.getActivitySummary', async (span) => {
      try {
        span.setAttribute('user.id', userId);
        span.setAttribute('resolution', resolution);
        console.info(`[TrendsAPI] getActivitySummary called for user: ${userId}`);
        
        const result = await this.queryChart({
          userId,
          metricType: 'ACTIVITY',
          timeRange,
          resolution,
          aggregation: 'SUM',
          chartType: 'BAR',
          series: [
            {
              name: 'Steps',
              metricName: 'health_activity_steps',
              aggregation: 'SUM'
            }
          ]
        });
        
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

  /**
   * Get blood pressure history for a user
   * @param {string} userId - User email/ID
   * @param {Object} timeRange - Time range with from/to timestamps in nanoseconds
   * @param {string} resolution - Time resolution (default: 'HOUR')
   * @returns {Promise<Object>} Blood pressure history data
   */
  async getBloodPressureHistory(userId, timeRange, resolution = 'HOUR') {
    return tracer.startActiveSpan('TrendsAPI.getBloodPressureHistory', async (span) => {
      try {
        span.setAttribute('user.id', userId);
        span.setAttribute('resolution', resolution);
        console.info(`[TrendsAPI] getBloodPressureHistory called for user: ${userId}`);
        
        const result = await this.queryChart({
          userId,
          metricType: 'BLOODPRESSURE',
          timeRange,
          resolution,
          aggregation: 'AVG',
          chartType: 'LINE',
          series: [
            {
              name: 'Systolic',
              metricName: 'health_bloodpressure_systolic',
              aggregation: 'AVG'
            },
            {
              name: 'Diastolic',
              metricName: 'health_bloodpressure_diastolic',
              aggregation: 'AVG'
            }
          ]
        });
        
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

  /**
   * Get temperature trends for a user (T012).
   * Maps period enum to resolution, calls queryChart, post-processes unit conversion.
   * @param {string} userId - User ID
   * @param {string} period - DAY | WEEK | MONTH
   * @param {string} unit - CELSIUS | FAHRENHEIT
   * @returns {Promise<Object>} TemperatureTrend GraphQL shape
   */
  async getTemperatureTrends(userId, period = 'WEEK', unit = 'CELSIUS') {
    return tracer.startActiveSpan('TrendsAPI.getTemperatureTrends', async (span) => {
      try {
        span.setAttribute('user.id', userId);
        span.setAttribute('temperature.period', period);
        span.setAttribute('temperature.unit', unit);

        // Map period to charting-api resolution and window (contracts/charting-api.md)
        const resolutionMap = {
          DAY:   { resolution: 'HOUR',  hoursBack: 24 },
          WEEK:  { resolution: 'DAY',   hoursBack: 7  * 24 },
          MONTH: { resolution: 'DAY',   hoursBack: 30 * 24 }
        };
        const { resolution, hoursBack } = resolutionMap[period] || resolutionMap.WEEK;
        const now = Date.now();
        const timeRange = {
          from: (now - hoursBack * 60 * 60 * 1000) * 1_000_000,
          to: now * 1_000_000
        };

        const chartData = await this.queryChart({
          userId,
          metricType: 'TEMPERATURE',
          timeRange,
          resolution,
          aggregation: 'AVG',
          chartType: 'LINE',
          series: [
            { name: 'normalized_value_celsius_avg', metricName: 'health_temperature_celsius', aggregation: 'AVG' },
            { name: 'normalized_value_celsius_min', metricName: 'health_temperature_celsius', aggregation: 'MIN' },
            { name: 'normalized_value_celsius_max', metricName: 'health_temperature_celsius', aggregation: 'MAX' }
          ]
        });

        const avgSeries = chartData?.series?.find(s => s.name === 'normalized_value_celsius_avg');
        const minSeries = chartData?.series?.find(s => s.name === 'normalized_value_celsius_min');
        const maxSeries = chartData?.series?.find(s => s.name === 'normalized_value_celsius_max');
        const avgPoints = avgSeries?.points || [];
        const minPoints = minSeries?.points || [];
        const maxPoints = maxSeries?.points || [];

        const toUnit = (val) =>
          unit === 'FAHRENHEIT' ? parseFloat((val * 9 / 5 + 32).toFixed(2)) : parseFloat(val.toFixed(2));

        const dataPoints = avgPoints.map((ap, i) => ({
          timestamp: new Date(ap.timestamp).toISOString(),
          avg: toUnit(ap.value),
          min: toUnit(minPoints[i]?.value ?? ap.value),
          max: toUnit(maxPoints[i]?.value ?? ap.value),
          sampleCount: ap.sampleCount || 1
        }));

        const allAvgs = dataPoints.map(d => d.avg);
        const allMins = dataPoints.map(d => d.min);
        const allMaxs = dataPoints.map(d => d.max);

        const result = {
          period,
          unit,
          dataPoints,
          overallAvg: allAvgs.length ? parseFloat((allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length).toFixed(2)) : null,
          overallMin: allMins.length ? Math.min(...allMins) : null,
          overallMax: allMaxs.length ? Math.max(...allMaxs) : null
        };

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
